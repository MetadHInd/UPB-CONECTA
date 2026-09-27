import { describe, expect, it } from 'vitest';
import { ClassifyInstitutionalMessage } from '../../src/contexts/classification/application/ClassifyInstitutionalMessage.js';
import { ClassificationResult } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import { ConfidenceScore } from '../../src/contexts/classification/domain/value-objects/ConfidenceScore.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { ReviewThreshold } from '../../src/contexts/classification/domain/value-objects/ReviewThreshold.js';
import { InMemoryAdminAlertPort } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryAdminAlertPort.js';
import { InMemoryClassificationRetryQueue } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationRetryQueue.js';
import { InMemoryNotificationSchedulingPort } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryNotificationSchedulingPort.js';
import { InMemoryReviewThresholdConfig } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryReviewThresholdConfig.js';
import { IngestInstitutionalMessages } from '../../src/contexts/ingestion/application/IngestInstitutionalMessages.js';
import type { InstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';
import type { RawInstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/RawInstitutionalMessage.js';
import { ConvocatoriaAuditEventKind } from '../../src/contexts/ingestion/domain/ports/out/ConvocatoriaAuditLogPort.js';
import { DeduplicationPolicy } from '../../src/contexts/ingestion/domain/services/DeduplicationPolicy.js';
import { IdempotencyPolicy } from '../../src/contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { QuarantineIncidentPolicy } from '../../src/contexts/ingestion/domain/services/QuarantineIncidentPolicy.js';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import { InMemoryConvocatoriaAuditLog } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConvocatoriaAuditLog.js';
import { InMemoryIngestionCursorRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionCursorRepository.js';
import { InMemoryIngestionRunLogRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionRunLogRepository.js';
import { InMemoryMailboxAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryMailboxAdapter.js';
import { InMemoryProcessedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryProcessedMessageRegistry.js';
import { InMemoryQuarantineRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryQuarantineRepository.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { SpanishDueDateExtractor } from '../../src/contexts/ingestion/infrastructure/extraction/SpanishDueDateExtractor.js';
import { PracticeModality } from '../../src/contexts/practices/domain/entities/PracticeOffer.js';
import { ADMIN, buildPracticesHarness, validForm } from './practicesHarness.js';

type Harness = ReturnType<typeof buildPracticesHarness>;

const DAY = 24 * 3_600_000;

function rawMail(uid: number, subject: string, body: string): RawInstitutionalMessage {
  return {
    messageId: MessageId.fromHeader(`<practica-${uid}@upb.edu.co>`),
    mailboxUid: uid,
    sender: 'practicas@upb.edu.co',
    subject,
    receivedAt: new Date(Date.UTC(2026, 8, 10, 8, uid)),
    rawBody: body
  };
}

/**
 * Ingesta real (HU-01 a HU-10) sobre los mismos repositorios que usa el
 * backoffice: el clasificador de prueba decide por el asunto. Es el camino
 * automatico, sin pasar por `PublishConvocatoria`.
 */
async function ingest(practices: Harness, messages: RawInstitutionalMessage[]) {
  const clock = new FixedClock(practices.now());
  const registry = new InMemoryProcessedMessageRegistry();
  const consolidated = practices.registry;
  const normalizer = {
    normalize: (message: RawInstitutionalMessage): InstitutionalMessage => ({
      messageId: message.messageId,
      mailboxUid: message.mailboxUid,
      sender: message.sender,
      subject: message.subject,
      sentAt: message.receivedAt,
      recipients: ['estudiantes@upb.edu.co'],
      body: message.rawBody,
      attachments: []
    })
  };
  const classifier = {
    classify: async (message: InstitutionalMessage) =>
      ClassificationResult.fromCategory(message.subject.includes('práctica') ? MessageCategory.PRACTICA : MessageCategory.EVENTO, {
        confidenceScore: ConfidenceScore.of(0.9)
      })
  };
  const classifyMessage = new ClassifyInstitutionalMessage({
    classificationPort: classifier,
    resultRepository: practices.classifications,
    retryQueue: new InMemoryClassificationRetryQueue(),
    reviewThresholdConfig: new InMemoryReviewThresholdConfig(ReviewThreshold.of(0.6)),
    adminAlertPort: new InMemoryAdminAlertPort(),
    notificationSchedulingPort: new InMemoryNotificationSchedulingPort(),
    clock
  });
  await new IngestInstitutionalMessages({
    mailbox: new InMemoryMailboxAdapter(messages),
    registry,
    consolidatedRegistry: consolidated,
    quarantine: new InMemoryQuarantineRepository(),
    cursors: new InMemoryIngestionCursorRepository(),
    logs: new InMemoryIngestionRunLogRepository(),
    idempotency: new IdempotencyPolicy(registry),
    deduplication: new DeduplicationPolicy(consolidated),
    deduplicationWindowMs: 30 * DAY,
    quarantineIncidentPolicy: new QuarantineIncidentPolicy(1),
    normalizer,
    dueDateExtractor: new SpanishDueDateExtractor(),
    classifyMessage,
    clock,
    batchSize: 50
  }).execute();
}

const INGESTED_BANK = rawMail(1, 'Convocatoria de práctica en Bancolombia', 'Práctica en analítica. Cierra el 30 de octubre de 2026. Postula en https://practicas.upb.edu.co/oferta/482?utm_source=correo');
const INGESTED_OLD = rawMail(2, 'Convocatoria de práctica en Textiles del Valle', 'Práctica en producción. Cierra el 15 de septiembre de 2026. Postula en https://textiles.example.com/practicas');
const INGESTED_EVENT = rawMail(3, 'Feria de empleo UPB', 'Evento el 30 de octubre de 2026.');

async function list(practices: Harness, filters: Record<string, unknown> = {}) {
  const result = await practices.list.execute(filters);
  if (!result.ok) throw new Error(result.message);
  return result.offers;
}

async function publish(practices: Harness, overrides: Record<string, unknown> = {}) {
  const result = await practices.publish.execute({ form: validForm(overrides), publishedBy: ADMIN });
  if (!result.ok) throw new Error(result.message);
  return result;
}

describe('HU-22 — listado consolidado de la oferta de prácticas con filtros y detalle (RF-31, RF-32, RF-33)', () => {
  describe('criterio 1 — un listado único, sin distinción de origen', () => {
    it('reúne las ofertas de la ingesta y las cargadas manualmente, y deja fuera lo que no es práctica', async () => {
      const practices = buildPracticesHarness();
      await ingest(practices, [INGESTED_BANK, INGESTED_EVENT]);
      await publish(practices, { company: 'Sura', requirements: 'Excel', dueDate: '2026-11-20T22:00:00Z', applicationChannel: 'https://sura.example.com/p' });

      const offers = await list(practices);

      expect(offers.map((offer) => offer.title).sort()).toEqual(['Convocatoria de práctica en Bancolombia', 'Oferta de práctica en Sura']);
    });

    it('las dos fuentes tienen la misma forma y ninguna deja ver su origen', async () => {
      const practices = buildPracticesHarness();
      await ingest(practices, [INGESTED_BANK]);
      await publish(practices, { company: 'Sura', applicationChannel: 'https://sura.example.com/p' });

      const offers = await list(practices);

      expect(offers).toHaveLength(2);
      expect(Object.keys(offers[0]!).sort()).toEqual(Object.keys(offers[1]!).sort());
      for (const offer of offers) {
        const serialized = JSON.stringify(offer).toLowerCase();
        expect(serialized).not.toContain('origin');
        expect(serialized).not.toContain('source');
        expect(serialized).not.toContain('ingest');
        expect(serialized).not.toContain('manual');
      }
    });

    it('no lista lo retirado ni lo que quedó retenido para revisión', async () => {
      const practices = buildPracticesHarness();
      const kept = await publish(practices, { company: 'Sura', applicationChannel: 'https://sura.example.com/p' });
      const withdrawn = await publish(practices, { company: 'Retirada S.A.', applicationChannel: 'https://retirada.example.com' });
      await practices.withdraw.execute({ messageId: withdrawn.offer.messageId, withdrawnBy: ADMIN });
      const pending = await publish(practices, { company: 'Dudosa S.A.', applicationChannel: 'https://dudosa.example.com' });
      const record = await practices.classifications.findByMessageId(pending.offer.messageId);
      await practices.classifications.save({ ...record!, publicationStatus: 'pending-review' });

      const offers = await list(practices);

      expect(offers.map((offer) => offer.offerId)).toEqual([kept.offer.messageId]);
    });
  });

  describe('criterio 2 — filtros por programa, modalidad y estado, combinables', () => {
    async function seeded() {
      const practices = buildPracticesHarness();
      await ingest(practices, [INGESTED_BANK, INGESTED_OLD]);
      const a = await publish(practices, { company: 'A', modality: 'remota', targeting: { kind: 'programs', programIds: ['sistemas'] }, applicationChannel: 'https://a.example.com' });
      const b = await publish(practices, { company: 'B', modality: 'hibrida', targeting: { kind: 'programs', programIds: ['psicologia'] }, applicationChannel: 'https://b.example.com' });
      const c = await publish(practices, { company: 'C', modality: 'remota', targeting: { kind: 'faculty', facultyId: 'ingenieria' }, applicationChannel: 'https://c.example.com' });
      return { practices, a, b, c };
    }

    it('por programa: incluye lo dirigido al programa, a su facultad y a toda la comunidad', async () => {
      const { practices, a, c } = await seeded();

      const offers = await list(practices, { program: 'sistemas' });

      // Las ingeridas no declaran destinatarios: son para toda la comunidad.
      expect(offers.map((offer) => offer.company).sort()).toEqual(['A', 'C', null].sort());
      expect(offers.map((offer) => offer.offerId)).toEqual(expect.arrayContaining([a.offer.messageId, c.offer.messageId]));
    });

    it('por modalidad', async () => {
      const { practices } = await seeded();

      const remote = await list(practices, { modality: 'remota' });

      expect(remote.map((offer) => offer.company).sort()).toEqual(['A', 'C']);
    });

    it('la modalidad todavía no se extrae de la ingesta: una oferta ingerida no aparece al filtrar por modalidad', async () => {
      const { practices } = await seeded();

      const all = await list(practices);
      const remote = await list(practices, { modality: 'remota' });

      expect(all.filter((offer) => offer.modality === null)).toHaveLength(1);
      expect(remote.every((offer) => offer.modality === PracticeModality.REMOTE)).toBe(true);
    });

    it('por estado: abierta por defecto, cerrada o todas', async () => {
      const { practices } = await seeded();

      expect((await list(practices)).every((offer) => offer.status === 'abierta')).toBe(true);
      expect((await list(practices, { status: 'cerrada' })).map((offer) => offer.title)).toEqual(['Convocatoria de práctica en Textiles del Valle']);
      expect(await list(practices, { status: 'todas' })).toHaveLength(5);
    });

    it('combinados: programa, modalidad y estado a la vez', async () => {
      const { practices, c } = await seeded();

      const offers = await list(practices, { program: 'industrial', modality: 'remota', status: 'abierta' });

      expect(offers.map((offer) => offer.offerId)).toEqual([c.offer.messageId]);
    });

    it('rechaza filtros inválidos indicando el campo, sin listar nada', async () => {
      const practices = buildPracticesHarness();
      await publish(practices);

      const result = await practices.list.execute({ program: 'astronomia', modality: 'remotísima', status: 'quizas' });

      expect(result).toMatchObject({ ok: false });
      if (result.ok) return;
      expect(result.issues?.map((issue) => issue.field).sort()).toEqual(['modality', 'program', 'status']);
    });

    it('un filtro vacío se ignora, como un parámetro de consulta sin valor', async () => {
      const practices = buildPracticesHarness();
      await publish(practices);

      expect(await list(practices, { program: '', modality: '   ' })).toHaveLength(1);
    });
  });

  describe('criterio 3 — el detalle presenta empresa, descripción, requisitos, modalidad, cierre y canal', () => {
    it('una oferta cargada manualmente muestra todos los campos', async () => {
      const practices = buildPracticesHarness();
      const { offer } = await publish(practices);

      const detail = await practices.detail.execute({ offerId: offer.messageId });

      expect(detail).toMatchObject({
        offerId: offer.messageId,
        company: 'Banco Digital S.A.',
        description: 'Práctica en el equipo de desarrollo móvil.',
        requirements: 'Estudiante de 8.º semestre en adelante, Kotlin básico.',
        modality: PracticeModality.HYBRID,
        dueDate: { kind: 'con-fecha', date: new Date('2026-10-15T22:00:00Z') },
        closesAt: new Date('2026-10-15T22:00:00Z'),
        applicationChannel: 'https://practicas.upb.edu.co/oferta/482',
        applicationDomain: 'practicas.upb.edu.co',
        status: 'abierta',
        missingFields: []
      });
    });

    it('el canal por correo se presenta como correo, sin dominio web', async () => {
      const practices = buildPracticesHarness();
      const { offer } = await publish(practices, { applicationChannel: 'practicas@empresa.co' });

      const detail = await practices.detail.execute({ offerId: offer.messageId });

      expect(detail).toMatchObject({ applicationChannel: 'mailto:practicas@empresa.co', applicationDomain: null });
    });

    it('LIMITACIÓN: una oferta ingerida trae descripción, cierre y canal, y declara lo que no se extrae', async () => {
      const practices = buildPracticesHarness();
      await ingest(practices, [INGESTED_BANK]);
      const [item] = await list(practices);

      const detail = await practices.detail.execute({ offerId: item!.offerId });

      expect(detail).toMatchObject({
        title: 'Convocatoria de práctica en Bancolombia',
        description: expect.stringContaining('Práctica en analítica'),
        applicationChannel: 'https://practicas.upb.edu.co/oferta/482?utm_source=correo',
        company: null,
        requirements: null,
        modality: null,
        status: 'abierta'
      });
      expect(detail?.closesAt).toBeInstanceOf(Date);
      expect(detail?.missingFields).toEqual(['company', 'requirements', 'modality']);
    });

    it('devuelve null si la oferta no existe, no es una práctica o fue retirada', async () => {
      const practices = buildPracticesHarness();
      await ingest(practices, [INGESTED_EVENT]);
      const { offer } = await publish(practices);
      const eventId = 'practica-3@upb.edu.co';
      expect(await practices.registry.findByRepresentativeMessageId(eventId)).not.toBeNull();
      await practices.withdraw.execute({ messageId: offer.messageId, withdrawnBy: ADMIN });

      expect(await practices.detail.execute({ offerId: 'no-existe' })).toBeNull();
      expect(await practices.detail.execute({ offerId: eventId })).toBeNull();
      expect(await practices.detail.execute({ offerId: offer.messageId })).toBeNull();
    });
  });

  describe('criterio 4 — una oferta cerrada se distingue y no se mezcla con las vigentes', () => {
    it('el estado explícito acompaña a cada oferta y cambia cuando pasa la fecha de cierre', async () => {
      const practices = buildPracticesHarness();
      const { offer } = await publish(practices);
      expect((await list(practices))[0]).toMatchObject({ offerId: offer.messageId, status: 'abierta' });

      practices.setNow(new Date('2026-10-16T00:00:00Z'));

      expect(await list(practices)).toEqual([]);
      expect((await list(practices, { status: 'cerrada' }))[0]).toMatchObject({ offerId: offer.messageId, status: 'cerrada' });
      expect((await practices.detail.execute({ offerId: offer.messageId }))?.status).toBe('cerrada');
    });

    it('con el filtro "todas" las vigentes van primero y las cerradas al final', async () => {
      const practices = buildPracticesHarness();
      await ingest(practices, [INGESTED_OLD]);
      await publish(practices, { company: 'Tarde', dueDate: '2026-12-01T22:00:00Z', applicationChannel: 'https://tarde.example.com' });
      await publish(practices, { company: 'Pronto', dueDate: '2026-10-01T22:00:00Z', applicationChannel: 'https://pronto.example.com' });

      const offers = await list(practices, { status: 'todas' });

      expect(offers.map((offer) => [offer.company, offer.status])).toEqual([
        ['Pronto', 'abierta'],
        ['Tarde', 'abierta'],
        [null, 'cerrada']
      ]);
    });

    it('sin fecha de cierre interpretable la oferta sigue abierta y lo dice el modelo', async () => {
      const practices = buildPracticesHarness();
      await ingest(practices, [rawMail(9, 'Convocatoria de práctica en Acme', 'Práctica en Acme. Postula en https://acme.example.com/p')]);

      const [item] = await list(practices);

      expect(item).toMatchObject({ status: 'abierta', closesAt: null, dueDate: { kind: 'sin-vencimiento' } });
    });
  });

  describe('criterio 5 — una oferta ingerida y luego cargada a mano se consolida en un solo registro', () => {
    it('la carga manual con el mismo canal de postulación completa la oferta ingerida en vez de duplicarla', async () => {
      const practices = buildPracticesHarness();
      await ingest(practices, [INGESTED_BANK]);
      const [ingested] = await list(practices);

      const result = await practices.publish.execute({
        form: validForm({ company: 'Bancolombia', applicationChannel: 'https://PRACTICAS.upb.edu.co/oferta/482/', dueDate: '2026-10-30T22:00:00Z' }),
        publishedBy: ADMIN
      });

      expect(result).toMatchObject({ ok: true, consolidated: true });
      if (!result.ok) return;
      expect(result.offer.messageId).toBe(ingested!.offerId);
      const offers = await list(practices);
      expect(offers).toHaveLength(1);
      expect(offers[0]).toMatchObject({ offerId: ingested!.offerId, company: 'Bancolombia', modality: PracticeModality.HYBRID });
      expect((practices.registry as unknown as { size: number }).size).toBe(1);
      const detail = await practices.detail.execute({ offerId: ingested!.offerId });
      expect(detail).toMatchObject({ company: 'Bancolombia', requirements: expect.stringContaining('Kotlin'), missingFields: [] });
    });

    it('la consolidación queda auditada como edición, con el administrador y los campos que aportó', async () => {
      const practices = buildPracticesHarness();
      await ingest(practices, [INGESTED_BANK]);
      const [ingested] = await list(practices);

      await practices.publish.execute({
        form: validForm({ company: 'Bancolombia', applicationChannel: 'https://practicas.upb.edu.co/oferta/482' }),
        publishedBy: ADMIN
      });

      const events = (practices.auditLog as InMemoryConvocatoriaAuditLog).events;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ kind: ConvocatoriaAuditEventKind.EDITED, messageId: ingested!.offerId, actor: ADMIN });
      expect(events[0]?.changedFields).toEqual(expect.arrayContaining(['targeting', 'company', 'requirements', 'modality']));
    });

    it('la oferta consolidada conserva la identidad de la ingerida: lo guardado por el estudiante sigue apuntando a ella', async () => {
      const practices = buildPracticesHarness();
      await ingest(practices, [INGESTED_BANK]);
      const before = await practices.registry.findByRepresentativeMessageId('practica-1@upb.edu.co');

      await practices.publish.execute({
        form: validForm({ company: 'Bancolombia', applicationChannel: 'https://practicas.upb.edu.co/oferta/482' }),
        publishedBy: ADMIN
      });

      const after = await practices.registry.findByRepresentativeMessageId('practica-1@upb.edu.co');
      expect(after).toMatchObject({ sender: before!.sender, subject: before!.subject, firstSentAt: before!.firstSentAt });
    });

    it('dos cargas manuales de la misma empresa con cierre el mismo día se consolidan aunque cambie el enlace', async () => {
      const practices = buildPracticesHarness();
      const first = await publish(practices, { company: 'Sura S.A.S.', applicationChannel: 'https://sura.example.com/a' });

      const second = await practices.publish.execute({
        form: validForm({ company: 'sura sas', applicationChannel: 'https://sura.example.com/b', requirements: 'Requisitos nuevos' }),
        publishedBy: ADMIN
      });

      expect(second).toMatchObject({ ok: true, consolidated: true });
      if (!second.ok) return;
      expect(second.offer.messageId).toBe(first.offer.messageId);
      expect(second.offer.company).toBe('Sura S.A.S.');
      expect(second.offer.requirements).toBe('Requisitos nuevos');
      expect(await list(practices)).toHaveLength(1);
    });

    it('ofertas distintas no se consolidan: otro canal y otra empresa siguen siendo dos registros', async () => {
      const practices = buildPracticesHarness();
      await ingest(practices, [INGESTED_BANK]);

      const result = await publish(practices, { company: 'Otra empresa', applicationChannel: 'https://otra.example.com/p' });

      expect(result.consolidated).toBe(false);
      expect(await list(practices)).toHaveLength(2);
    });

    it('una oferta retirada no absorbe una carga nueva: se publica otra', async () => {
      const practices = buildPracticesHarness();
      const first = await publish(practices);
      await practices.withdraw.execute({ messageId: first.offer.messageId, withdrawnBy: ADMIN });

      const again = await publish(practices);

      expect(again.consolidated).toBe(false);
      expect(again.offer.messageId).not.toBe(first.offer.messageId);
    });

    it('una carga inválida no consolida ni escribe nada', async () => {
      const practices = buildPracticesHarness();
      await ingest(practices, [INGESTED_BANK]);

      const result = await practices.publish.execute({
        form: validForm({ applicationChannel: 'https://practicas.upb.edu.co/oferta/482', modality: 'nocturna' }),
        publishedBy: ADMIN
      });

      expect(result.ok).toBe(false);
      expect((practices.auditLog as InMemoryConvocatoriaAuditLog).events).toHaveLength(0);
      expect(await list(practices)).toHaveLength(1);
    });
  });
});
