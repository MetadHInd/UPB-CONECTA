import { describe, expect, it } from 'vitest';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { ConvocatoriaAuditEventKind } from '../../src/contexts/ingestion/domain/ports/out/ConvocatoriaAuditLogPort.js';
import { PracticeOfferFailureKind } from '../../src/contexts/practices/application/PracticeOfferResults.js';
import { PracticeModality } from '../../src/contexts/practices/domain/entities/PracticeOffer.js';
import { ADMIN, buildPracticesHarness, T0, validForm } from './practicesHarness.js';

type Harness = ReturnType<typeof buildPracticesHarness>;

async function publishValid(practices: Harness, overrides: Record<string, unknown> = {}) {
  const result = await practices.publish.execute({ form: validForm(overrides), publishedBy: ADMIN });
  if (!result.ok) throw new Error(result.message);
  return result.offer;
}

const HOUR = 3_600_000;

describe('HU-24 — carga manual de ofertas de práctica por el administrador (RF-36, RF-74, RNF-15, RNF-18)', () => {
  describe('criterio 1 — los mismos campos que produce el proceso automático', () => {
    it('empresa, descripción, requisitos, modalidad, programas, fecha de cierre y canal quedan donde los deja la ingesta', async () => {
      const practices = buildPracticesHarness();

      const offer = await publishValid(practices);

      const record = await practices.registry.findByRepresentativeMessageId(offer.messageId);
      expect(record).toMatchObject({
        sender: ADMIN,
        subject: 'Oferta de práctica en Banco Digital S.A.',
        body: 'Práctica en el equipo de desarrollo móvil.',
        dueDate: { kind: 'con-fecha', date: new Date('2026-10-15T22:00:00Z') },
        applicationLink: 'https://practicas.upb.edu.co/oferta/482',
        withdrawnAt: null
      });
      expect(await practices.classifications.findByMessageId(offer.messageId)).toMatchObject({
        finalCategory: MessageCategory.PRACTICA,
        publicationStatus: 'published',
        confidenceScore: 1
      });
      expect((await practices.targetingRepo.findByMessageId(offer.messageId))?.targeting).toEqual({ kind: 'programs', programIds: ['sistemas'] });
      expect(await practices.offers.findByMessageId(offer.messageId)).toMatchObject({
        company: 'Banco Digital S.A.',
        requirements: 'Estudiante de 8.º semestre en adelante, Kotlin básico.',
        modality: PracticeModality.HYBRID,
        createdBy: ADMIN,
        withdrawnAt: null
      });
    });

    it('el canal de postulación puede ser un correo, que se guarda como enlace mailto', async () => {
      const practices = buildPracticesHarness();

      const offer = await publishValid(practices, { applicationChannel: ' practicas.ingenierias@upb.edu.co ' });

      expect((await practices.registry.findByRepresentativeMessageId(offer.messageId))?.applicationLink).toBe(
        'mailto:practicas.ingenierias@upb.edu.co'
      );
    });

    it('acepta toda la comunidad o una facultad como destinatarios', async () => {
      const practices = buildPracticesHarness();

      const all = await publishValid(practices, { company: 'A', applicationChannel: 'https://a.example.com', targeting: { kind: 'all-community' } });
      const faculty = await publishValid(practices, { company: 'B', applicationChannel: 'https://b.example.com', targeting: { kind: 'faculty', facultyId: 'ingenieria' } });

      expect((await practices.targetingRepo.findByMessageId(all.messageId))?.targeting).toEqual({ kind: 'all-community' });
      expect((await practices.targetingRepo.findByMessageId(faculty.messageId))?.targeting).toEqual({ kind: 'faculty', facultyId: 'ingenieria' });
    });

    it('neutraliza marcado embebido en el texto libre (HU-47 criterio 7)', async () => {
      const practices = buildPracticesHarness();

      const offer = await publishValid(practices, { company: 'ACME <b>', requirements: '<script>x</script>' });

      expect(offer.company).toBe('ACME &lt;b&gt;');
      expect(offer.requirements).toBe('&lt;script&gt;x&lt;/script&gt;');
    });
  });

  describe('criterio 2 — entra al mismo flujo de segmentación y notificación que una oferta ingerida', () => {
    it('solo la ve en el feed el programa destinatario, y dispara el aviso de publicación', async () => {
      const practices = buildPracticesHarness();

      const offer = await publishValid(practices);

      expect(await practices.feedFor('sistemas')).toEqual([offer.messageId]);
      expect(await practices.feedFor('psicologia')).toEqual([]);
      expect(practices.scheduling.scheduled.map((record) => [record.messageId, record.finalCategory])).toEqual([
        [offer.messageId, MessageCategory.PRACTICA]
      ]);
    });

    it('el planificador de vencimiento avisa a los destinatarios antes del cierre', async () => {
      const practices = buildPracticesHarness();
      await publishValid(practices);

      practices.setNow(new Date(new Date('2026-10-15T22:00:00Z').getTime() - 23 * HOUR));

      expect(await practices.reminderCycle()).toEqual(['ana@upb.edu.co']);
    });
  });

  describe('criterio 3 — el servidor valida y rechaza indicando qué falta', () => {
    it('sin campos obligatorios rechaza, lista cada uno que falta y no guarda nada', async () => {
      const practices = buildPracticesHarness();

      const result = await practices.publish.execute({
        form: { company: '  ', description: 'Algo', modality: null },
        publishedBy: ADMIN
      });

      expect(result).toMatchObject({ ok: false, error: PracticeOfferFailureKind.INVALID_OFFER });
      if (result.ok) throw new Error('debía rechazarse');
      expect(result.issues).toEqual([
        { field: 'company', message: 'Falta la empresa.' },
        { field: 'requirements', message: 'Faltan los requisitos.' },
        { field: 'modality', message: 'Falta la modalidad.' },
        { field: 'targeting', message: 'Faltan los programas destinatarios.' },
        { field: 'dueDate', message: 'Falta la fecha de cierre.' },
        { field: 'applicationChannel', message: 'Falta el canal de postulación.' }
      ]);
      expect(result.message).toMatch(/^No se guardó la oferta\. Falta la empresa\./);
      expect(practices.scheduling.scheduled).toHaveLength(0);
      expect((practices.auditLog as unknown as { events: unknown[] }).events).toHaveLength(0);
    });

    it.each([
      [{ modality: 'mixta' }, 'modality', 'La modalidad debe ser una de: presencial, remota, hibrida.'],
      [{ targeting: { kind: 'programs', programIds: ['medicina'] } }, 'targeting', 'Programas fuera del catálogo institucional: medicina.'],
      [{ targeting: { kind: 'programs', programIds: [] } }, 'targeting', 'Indica al menos un programa destinatario.'],
      [{ targeting: { kind: 'faculty', facultyId: 'artes' } }, 'targeting', 'La facultad "artes" no está en el catálogo institucional.'],
      [{ targeting: 'sistemas' }, 'targeting', 'Los programas destinatarios deben ser toda la comunidad, una facultad o una lista de programas.'],
      [{ dueDate: '2026-09-01T00:00:00Z' }, 'dueDate', 'La fecha de cierre ya pasó: una oferta cerrada no llega a ningún estudiante.'],
      [{ dueDate: 'mañana' }, 'dueDate', 'La fecha de cierre no es una fecha válida.'],
      [{ applicationChannel: 'por WhatsApp' }, 'applicationChannel', 'El canal de postulación debe ser un enlace http(s) o un correo electrónico.'],
      [{ applicationChannel: 'ftp://upb.edu.co/x' }, 'applicationChannel', 'El canal de postulación debe ser un enlace http(s) o un correo electrónico.'],
      [{ company: 'x'.repeat(151) }, 'company', 'Admite hasta 150 caracteres.'],
      [{ description: 42 }, 'description', 'Debe ser texto.'],
      [{ salario: '2 SMLV' }, 'salario', 'Campo no admitido en una oferta de práctica.']
    ])('rechaza %o en el campo correcto', async (overrides, field, message) => {
      const practices = buildPracticesHarness();

      const result = await practices.publish.execute({ form: validForm(overrides), publishedBy: ADMIN });

      expect(result).toMatchObject({ ok: false, error: PracticeOfferFailureKind.INVALID_OFFER, issues: [{ field, message }] });
      expect(practices.scheduling.scheduled).toHaveLength(0);
    });
  });

  describe('criterio 4 — la publicación queda auditada con administrador, acción y marca de tiempo', () => {
    it('registra un evento de publicación con el administrador y la hora', async () => {
      const practices = buildPracticesHarness();

      const offer = await publishValid(practices);

      expect((practices.auditLog as unknown as { events: unknown[] }).events).toEqual([
        expect.objectContaining({ kind: ConvocatoriaAuditEventKind.PUBLISHED, messageId: offer.messageId, actor: ADMIN, occurredAt: T0 })
      ]);
    });
  });

  describe('criterio 5 — editar o retirar recalcula los avisos programados y se audita', () => {
    it('al mover la fecha de cierre, el aviso sale según la fecha nueva y no la vieja', async () => {
      const practices = buildPracticesHarness();
      const offer = await publishValid(practices);

      const edited = await practices.edit.execute({ messageId: offer.messageId, form: { dueDate: '2026-10-20T22:00:00Z' }, editedBy: 'otra-admin@upb.edu.co' });
      expect(edited).toMatchObject({ ok: true, changedFields: ['dueDate'] });

      practices.setNow(new Date(new Date('2026-10-15T22:00:00Z').getTime() - 23 * HOUR));
      expect(await practices.reminderCycle()).toEqual([]);
      practices.setNow(new Date(new Date('2026-10-20T22:00:00Z').getTime() - 23 * HOUR));
      expect(await practices.reminderCycle()).toEqual(['ana@upb.edu.co']);
    });

    it('al ampliar los programas destinatarios, el feed y los avisos llegan a los nuevos', async () => {
      const practices = buildPracticesHarness();
      const offer = await publishValid(practices);

      await practices.edit.execute({ messageId: offer.messageId, form: { targeting: { kind: 'faculty', facultyId: 'ingenieria' } }, editedBy: ADMIN });

      expect(await practices.feedFor('industrial')).toEqual([offer.messageId]);
      expect(await practices.feedFor('psicologia')).toEqual([]);
      practices.setNow(new Date(new Date('2026-10-15T22:00:00Z').getTime() - 23 * HOUR));
      expect((await practices.reminderCycle()).sort()).toEqual(['ana@upb.edu.co', 'ivan@upb.edu.co']);
    });

    it('la edición queda auditada con quién, cuándo y qué campos cambió, incluidos los propios de la práctica', async () => {
      const practices = buildPracticesHarness();
      const offer = await publishValid(practices);
      practices.setNow(new Date(T0.getTime() + HOUR));

      const result = await practices.edit.execute({
        messageId: offer.messageId,
        form: { description: 'Nueva descripción', requirements: 'Kotlin avanzado', modality: 'remota', applicationChannel: 'https://upb.edu.co/nuevo' },
        editedBy: 'otra-admin@upb.edu.co'
      });

      expect(result).toMatchObject({
        ok: true,
        changedFields: ['description', 'applicationChannel', 'requirements', 'modality'],
        offer: { requirements: 'Kotlin avanzado', modality: PracticeModality.REMOTE, updatedBy: 'otra-admin@upb.edu.co', updatedAt: practices.now() }
      });
      expect((practices.auditLog as unknown as { events: unknown[] }).events.at(-1)).toEqual(
        expect.objectContaining({
          kind: ConvocatoriaAuditEventKind.EDITED,
          actor: 'otra-admin@upb.edu.co',
          occurredAt: practices.now(),
          changedFields: ['body', 'applicationLink', 'requirements', 'modality']
        })
      );
      expect(await practices.registry.findByRepresentativeMessageId(offer.messageId)).toMatchObject({
        body: 'Nueva descripción',
        applicationLink: 'https://upb.edu.co/nuevo'
      });
    });

    it('una edición sin cambios reales no escribe ni audita', async () => {
      const practices = buildPracticesHarness();
      const offer = await publishValid(practices);

      const result = await practices.edit.execute({ messageId: offer.messageId, form: { modality: 'hibrida', dueDate: '2026-10-15T22:00:00Z' }, editedBy: ADMIN });

      expect(result).toMatchObject({ ok: true, changedFields: [], offer: { updatedAt: T0 } });
      expect((practices.auditLog as unknown as { events: unknown[] }).events).toHaveLength(1);
    });

    it('la empresa no se edita, un campo vacío o inválido se rechaza, y un formulario vacío también', async () => {
      const practices = buildPracticesHarness();
      const offer = await publishValid(practices);

      expect(await practices.edit.execute({ messageId: offer.messageId, form: { company: 'Otra' }, editedBy: ADMIN })).toMatchObject({
        ok: false,
        issues: [{ field: 'company', message: expect.stringContaining('no se puede editar') }]
      });
      expect(await practices.edit.execute({ messageId: offer.messageId, form: { requirements: ' ' }, editedBy: ADMIN })).toMatchObject({
        ok: false,
        issues: [{ field: 'requirements', message: 'Faltan los requisitos: no se puede dejar vacío.' }]
      });
      expect(await practices.edit.execute({ messageId: offer.messageId, form: { dueDate: '2026-01-01' }, editedBy: ADMIN })).toMatchObject({
        ok: false,
        issues: [{ field: 'dueDate' }]
      });
      expect(await practices.edit.execute({ messageId: offer.messageId, form: {}, editedBy: ADMIN })).toMatchObject({
        ok: false,
        issues: [{ field: '*', message: 'No se envió ningún cambio.' }]
      });
      expect(await practices.edit.execute({ messageId: 'no-existe', form: { modality: 'remota' }, editedBy: ADMIN })).toMatchObject({
        ok: false,
        error: PracticeOfferFailureKind.OFFER_NOT_FOUND
      });
    });

    it('retirar la saca del feed, cancela sus avisos, deja de avisar el vencimiento y se audita', async () => {
      const practices = buildPracticesHarness();
      const offer = await publishValid(practices);
      practices.setNow(new Date(T0.getTime() + HOUR));

      const result = await practices.withdraw.execute({ messageId: offer.messageId, withdrawnBy: ADMIN });

      expect(result).toMatchObject({ ok: true, offer: { withdrawnAt: practices.now(), updatedBy: ADMIN } });
      expect(await practices.feedFor('sistemas')).toEqual([]);
      expect(practices.scheduling.cancelled).toEqual([offer.messageId]);
      practices.setNow(new Date(new Date('2026-10-15T22:00:00Z').getTime() - 23 * HOUR));
      expect(await practices.reminderCycle()).toEqual([]);
      expect((practices.auditLog as unknown as { events: unknown[] }).events.at(-1)).toEqual(
        expect.objectContaining({ kind: ConvocatoriaAuditEventKind.WITHDRAWN, messageId: offer.messageId, actor: ADMIN })
      );
    });

    it('una oferta retirada no se vuelve a retirar ni se edita', async () => {
      const practices = buildPracticesHarness();
      const offer = await publishValid(practices);
      await practices.withdraw.execute({ messageId: offer.messageId, withdrawnBy: ADMIN });

      expect(await practices.withdraw.execute({ messageId: offer.messageId, withdrawnBy: ADMIN })).toMatchObject({
        ok: false,
        error: PracticeOfferFailureKind.OFFER_WITHDRAWN
      });
      expect(await practices.edit.execute({ messageId: offer.messageId, form: { modality: 'remota' }, editedBy: ADMIN })).toMatchObject({
        ok: false,
        error: PracticeOfferFailureKind.OFFER_WITHDRAWN
      });
      expect(await practices.withdraw.execute({ messageId: 'no-existe', withdrawnBy: ADMIN })).toMatchObject({
        ok: false,
        error: PracticeOfferFailureKind.OFFER_NOT_FOUND
      });
    });

    it('si se retiró por la vía general de HU-50, editarla se rechaza y retirarla solo alinea la oferta', async () => {
      const practices = buildPracticesHarness();
      const offer = await publishValid(practices);
      await practices.withdrawConvocatoria.execute({ convocatoriaId: offer.convocatoriaId, withdrawnBy: ADMIN });

      expect(await practices.edit.execute({ messageId: offer.messageId, form: { modality: 'remota' }, editedBy: ADMIN })).toMatchObject({
        ok: false,
        error: PracticeOfferFailureKind.OFFER_WITHDRAWN
      });
      expect(await practices.withdraw.execute({ messageId: offer.messageId, withdrawnBy: ADMIN })).toMatchObject({ ok: true });
      const withdrawals = (practices.auditLog as unknown as { events: { kind: string }[] }).events.filter((e) => e.kind === ConvocatoriaAuditEventKind.WITHDRAWN);
      expect(withdrawals).toHaveLength(1);
    });
  });
});
