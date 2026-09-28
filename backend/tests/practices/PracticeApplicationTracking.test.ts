import { describe, expect, it } from 'vitest';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { defaultPreferences } from '../../src/contexts/notifications/domain/entities/NotificationPreferences.js';
import {
  PRACTICE_APPLICATION_STATUSES,
  PracticeApplicationStatus
} from '../../src/contexts/practices/domain/entities/PracticeApplicationTracking.js';
import { UNAVAILABLE_NOTICE, WITHDRAWN_NOTICE } from '../../src/contexts/practices/domain/services/PracticeTrackingPolicy.js';
import { buildDataRightsHarness } from '../datarights/dataRightsHarness.js';
import { ADMIN, buildPracticesHarness, validForm } from './practicesHarness.js';

type Harness = ReturnType<typeof buildPracticesHarness>;

const ANA = 'ana@upb.edu.co'; // sistemas: la oferta de validForm() va dirigida a su programa
const IVAN = 'ivan@upb.edu.co'; // industrial
const LUIS = 'luis@upb.edu.co'; // psicologia
const HOUR = 3_600_000;
const DUE = new Date('2026-10-15T22:00:00Z');

async function publishOffer(practices: Harness, overrides: Record<string, unknown> = {}): Promise<string> {
  const result = await practices.publish.execute({ form: validForm(overrides), publishedBy: ADMIN });
  if (!result.ok) throw new Error(result.message);
  return result.offer.messageId;
}

async function track(practices: Harness, studentId: string, offerId: string, status: unknown) {
  const result = await practices.track.execute({ studentId, offerId, status });
  if (!result.ok) throw new Error(result.message);
  return result;
}

async function groupOf(practices: Harness, studentId: string, status: PracticeApplicationStatus) {
  const view = await practices.tracking.execute({ studentId });
  return view.groups.find((group) => group.status === status)?.applications ?? [];
}

describe('HU-23 — seguimiento personal del estado de postulación y recordatorio de cierre (RF-34, RF-35, RNF-20)', () => {
  describe('criterio 1 — registrar el estado frente a una oferta', () => {
    it.each(PRACTICE_APPLICATION_STATUSES)('acepta el estado "%s"', async (status) => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);

      const result = await track(practices, ANA, offerId, status);

      expect(result.tracking).toMatchObject({ studentId: ANA, offerId, status, offerTitle: 'Oferta de práctica en Banco Digital S.A.', company: 'Banco Digital S.A.' });
    });

    it('el catálogo es exactamente interesado, postulado, en proceso y cerrado', () => {
      expect(PRACTICE_APPLICATION_STATUSES).toEqual(['interesado', 'postulado', 'en-proceso', 'cerrado']);
    });

    it.each([['aceptado'], ['Postulado'], [''], [undefined], [3]])('rechaza el estado %j sin guardar nada', async (status) => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);

      const result = await practices.track.execute({ studentId: ANA, offerId, status });

      expect(result).toMatchObject({ ok: false, error: 'invalid-status' });
      expect(await practices.trackings.findByStudent(ANA)).toEqual([]);
    });

    it('no se sigue una oferta que no existe, que no es práctica o que ya fue retirada', async () => {
      const practices = buildPracticesHarness();
      const withdrawn = await publishOffer(practices);
      await practices.withdraw.execute({ messageId: withdrawn, withdrawnBy: ADMIN });

      for (const offerId of ['no-existe', withdrawn]) {
        expect(await practices.track.execute({ studentId: ANA, offerId, status: 'interesado' })).toMatchObject({ ok: false, error: 'offer-not-found' });
      }
      expect(await practices.trackings.findByStudent(ANA)).toEqual([]);
    });
  });

  describe('criterio 2 — el cambio se persiste con marca de tiempo y se ve en el seguimiento', () => {
    it('cada cambio queda en el historial con su instante, y la vista muestra el estado vigente', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      const first = practices.now();
      await track(practices, ANA, offerId, 'interesado');
      const second = new Date(first.getTime() + 2 * HOUR);
      practices.setNow(second);

      const updated = await track(practices, ANA, offerId, 'postulado');

      expect(updated.changed).toBe(true);
      expect(updated.tracking).toMatchObject({ status: 'postulado', createdAt: first, updatedAt: second });
      expect(updated.tracking.history).toEqual([
        { status: 'interesado', at: first },
        { status: 'postulado', at: second }
      ]);
      expect(await practices.trackings.findByStudentAndOffer(ANA, offerId)).toEqual(updated.tracking);
      expect(await groupOf(practices, ANA, PracticeApplicationStatus.APPLIED)).toEqual([
        expect.objectContaining({ offerId, status: 'postulado', updatedAt: second, history: updated.tracking.history })
      ]);
      expect(await groupOf(practices, ANA, PracticeApplicationStatus.INTERESTED)).toEqual([]);
    });

    it('repetir el estado vigente no agrega historial ni cambia la marca de tiempo', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      const original = await track(practices, ANA, offerId, 'postulado');
      practices.setNow(new Date(practices.now().getTime() + HOUR));

      const repeated = await track(practices, ANA, offerId, 'postulado');

      expect(repeated.changed).toBe(false);
      expect(repeated.tracking).toEqual(original.tracking);
    });
  });

  describe('criterio 3 — recordatorio de cierre según la anticipación del estudiante', () => {
    it('quien marcó interés recibe el recordatorio aunque la oferta no vaya dirigida a su programa', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices); // dirigida a sistemas
      await track(practices, LUIS, offerId, 'interesado');

      practices.setNow(new Date(DUE.getTime() - 24 * HOUR));
      const reminded = await practices.reminderCycle();

      expect(reminded.sort()).toEqual([ANA, LUIS]); // Ana por segmentación, Luis por seguimiento; Iván no
    });

    it('usa la anticipación que eligió el estudiante', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      await track(practices, LUIS, offerId, 'postulado');
      await practices.preferences.save({ ...defaultPreferences(LUIS, practices.now()), leadTimeMinutes: 3 * 24 * 60 });

      practices.setNow(new Date(DUE.getTime() - 3 * 24 * HOUR - HOUR));
      expect(await practices.reminderCycle()).toEqual([]);
      practices.setNow(new Date(DUE.getTime() - 3 * 24 * HOUR));
      expect(await practices.reminderCycle()).toEqual([LUIS]);
    });

    it('en proceso o cerrado no recibe recordatorio por seguimiento', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      await track(practices, LUIS, offerId, 'en-proceso');
      await track(practices, IVAN, offerId, 'cerrado');

      practices.setNow(new Date(DUE.getTime() - 24 * HOUR));

      expect(await practices.reminderCycle()).toEqual([ANA]);
    });

    it('quien está en la segmentación y además la sigue recibe un solo aviso por umbral', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      await track(practices, ANA, offerId, 'interesado');

      practices.setNow(new Date(DUE.getTime() - 24 * HOUR));
      expect(await practices.reminderCycle()).toEqual([ANA]);
      practices.setNow(new Date(DUE.getTime() - 23 * HOUR));
      expect(await practices.reminderCycle()).toEqual([]);
    });

    it('respeta la categoría desactivada, y una oferta retirada no avisa a quien la seguía', async () => {
      const practices = buildPracticesHarness();
      const silenced = await publishOffer(practices);
      const withdrawn = await publishOffer(practices, { company: 'Otra Empresa', applicationChannel: 'https://otra.example.com/p' });
      await track(practices, LUIS, silenced, 'interesado');
      await track(practices, IVAN, withdrawn, 'interesado');
      await practices.preferences.save({ ...defaultPreferences(LUIS, practices.now()), categoryPreferences: { [MessageCategory.PRACTICA]: false } });
      await practices.withdraw.execute({ messageId: withdrawn, withdrawnBy: ADMIN });

      practices.setNow(new Date(DUE.getTime() - 24 * HOUR));

      expect(await practices.reminderCycle()).toEqual([ANA]);
    });
  });

  describe('criterio 4 — el estado de postulación no es visible para terceros', () => {
    it('el listado y el detalle de la oferta no cambian ni dejan ver quién la sigue', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      const listBefore = await practices.list.execute({ status: 'todas' });
      const detailBefore = await practices.detail.execute({ offerId });

      await track(practices, ANA, offerId, 'postulado');
      await track(practices, LUIS, offerId, 'interesado');

      const listAfter = await practices.list.execute({ status: 'todas' });
      const detailAfter = await practices.detail.execute({ offerId });
      expect(listAfter).toEqual(listBefore);
      expect(detailAfter).toEqual(detailBefore);
      for (const shown of [JSON.stringify(listAfter), JSON.stringify(detailAfter)]) {
        expect(shown).not.toContain(ANA);
        expect(shown).not.toContain('postulado');
      }
    });

    it('cada estudiante solo ve su propio seguimiento', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      await track(practices, ANA, offerId, 'postulado');

      const other = await practices.tracking.execute({ studentId: LUIS });

      expect(other.total).toBe(0);
      expect(other.groups.every((group) => group.applications.length === 0)).toBe(true);
      expect(JSON.stringify(other)).not.toContain(ANA);
    });

    it('no hay operación administrativa sobre el seguimiento: ninguna figura en las operaciones protegidas', async () => {
      const { readFileSync } = await import('node:fs');
      const catalog = JSON.parse(readFileSync(new URL('../../config/protected-operations.json', import.meta.url), 'utf8')) as {
        operations: { operation: string }[];
      };
      expect(catalog.operations.map((entry) => entry.operation).filter((name) => /Tracking|TrackPractice/.test(name))).toEqual([]);
    });
  });

  describe('criterio 5 — la vista de seguimiento agrupa por estado', () => {
    it('siempre los cuatro grupos, en orden de avance, lo más reciente primero', async () => {
      const practices = buildPracticesHarness();
      const a = await publishOffer(practices, { company: 'Empresa A', applicationChannel: 'https://a.example.com/p' });
      const b = await publishOffer(practices, { company: 'Empresa B', applicationChannel: 'https://b.example.com/p' });
      const c = await publishOffer(practices, { company: 'Empresa C', applicationChannel: 'https://c.example.com/p' });
      await track(practices, ANA, a, 'postulado');
      practices.setNow(new Date(practices.now().getTime() + HOUR));
      await track(practices, ANA, b, 'postulado');
      await track(practices, ANA, c, 'interesado');

      const view = await practices.tracking.execute({ studentId: ANA });

      expect(view.total).toBe(3);
      expect(view.groups.map((group) => [group.status, group.applications.map((application) => application.company)])).toEqual([
        ['interesado', ['Empresa C']],
        ['postulado', ['Empresa B', 'Empresa A']],
        ['en-proceso', []],
        ['cerrado', []]
      ]);
      expect(view.groups[1]?.applications[0]).toMatchObject({ situation: 'abierta', closesAt: DUE, notice: null });
    });

    it('una oferta cuyo cierre ya pasó se muestra como cerrada, sin aviso extra', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      await track(practices, ANA, offerId, 'postulado');
      practices.setNow(new Date(DUE.getTime() + HOUR));

      expect(await groupOf(practices, ANA, PracticeApplicationStatus.APPLIED)).toEqual([
        expect.objectContaining({ offerId, situation: 'cerrada', notice: null })
      ]);
    });
  });

  describe('criterio 6 — una oferta retirada se informa en vez de desaparecer', () => {
    it('retirada por el backoffice de prácticas: sigue en el seguimiento con la fecha y la explicación', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      await track(practices, ANA, offerId, 'postulado');
      const withdrawnAt = new Date(practices.now().getTime() + HOUR);
      practices.setNow(withdrawnAt);

      await practices.withdraw.execute({ messageId: offerId, withdrawnBy: ADMIN });

      expect(await practices.list.execute({})).toMatchObject({ ok: true, offers: [] });
      expect(await groupOf(practices, ANA, PracticeApplicationStatus.APPLIED)).toEqual([
        expect.objectContaining({
          offerId,
          offerTitle: 'Oferta de práctica en Banco Digital S.A.',
          situation: 'retirada',
          withdrawnAt,
          notice: WITHDRAWN_NOTICE
        })
      ]);
    });

    it('retirada por la vía general de convocatorias (HU-50): mismo aviso', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      await track(practices, ANA, offerId, 'interesado');
      const offer = await practices.offers.findByMessageId(offerId);

      await practices.withdrawConvocatoria.execute({ convocatoriaId: offer!.convocatoriaId, withdrawnBy: ADMIN });

      expect(await groupOf(practices, ANA, PracticeApplicationStatus.INTERESTED)).toEqual([
        expect.objectContaining({ offerId, situation: 'retirada', notice: WITHDRAWN_NOTICE })
      ]);
    });

    it('una oferta que ya no figura se conserva con el título guardado y se explica', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      await track(practices, ANA, offerId, 'interesado');
      await practices.classifications.save({ ...(await practices.classifications.findByMessageId(offerId))!, finalCategory: MessageCategory.EVENTO });

      expect(await groupOf(practices, ANA, PracticeApplicationStatus.INTERESTED)).toEqual([
        expect.objectContaining({ offerId, offerTitle: 'Oferta de práctica en Banco Digital S.A.', situation: 'no-disponible', notice: UNAVAILABLE_NOTICE })
      ]);
    });

    it('el estudiante puede seguir actualizando una oferta retirada, por ejemplo darla por cerrada', async () => {
      const practices = buildPracticesHarness();
      const offerId = await publishOffer(practices);
      await track(practices, ANA, offerId, 'postulado');
      await practices.withdraw.execute({ messageId: offerId, withdrawnBy: ADMIN });

      const closed = await track(practices, ANA, offerId, 'cerrado');

      expect(closed.tracking.status).toBe('cerrado');
      expect(await groupOf(practices, ANA, PracticeApplicationStatus.CLOSED)).toEqual([expect.objectContaining({ offerId, situation: 'retirada' })]);
    });
  });

  describe('dato personal (HU-48): el titular lo consulta y la supresión lo alcanza', () => {
    it('aparece en el área de seguimiento del informe y se borra al suprimir', async () => {
      const rights = buildDataRightsHarness();
      const at = rights.now();
      await rights.practiceTrackings.save({
        studentId: ANA,
        offerId: 'oferta-1',
        offerTitle: 'Oferta de práctica en Banco Digital S.A.',
        company: 'Banco Digital S.A.',
        status: PracticeApplicationStatus.APPLIED,
        history: [
          { status: PracticeApplicationStatus.INTERESTED, at },
          { status: PracticeApplicationStatus.APPLIED, at }
        ],
        createdAt: at,
        updatedAt: at
      });

      const report = await rights.report.execute({ subject: ANA });
      expect(report.areas.find((area) => area.area === 'applicationTracking')?.records).toEqual([
        {
          practiceOffer: 'Oferta de práctica en Banco Digital S.A.',
          applicationStatus: 'postulado',
          statusHistory: `interesado (${at.toISOString()}), postulado (${at.toISOString()})`,
          updatedAt: at
        }
      ]);

      const confirmation = await rights.erase.execute({ subject: ANA });
      expect(confirmation).toMatchObject({ status: 'completed', erased: expect.objectContaining({ applicationTracking: 1 }) });
      expect(await rights.practiceTrackings.findByStudent(ANA)).toEqual([]);
    });
  });
});
