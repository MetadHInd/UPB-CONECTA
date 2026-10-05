import { describe, expect, it } from 'vitest';
import { IngestInstitutionalMessages } from '../../src/contexts/ingestion/application/IngestInstitutionalMessages.js';
import type { RawInstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/RawInstitutionalMessage.js';
import type { InstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import { IdempotencyPolicy } from '../../src/contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { DeduplicationPolicy } from '../../src/contexts/ingestion/domain/services/DeduplicationPolicy.js';
import { QuarantineIncidentPolicy } from '../../src/contexts/ingestion/domain/services/QuarantineIncidentPolicy.js';
import { InMemoryMailboxAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryMailboxAdapter.js';
import { InMemoryProcessedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryProcessedMessageRegistry.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryQuarantineRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryQuarantineRepository.js';
import { InMemoryIngestionCursorRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionCursorRepository.js';
import { InMemoryIngestionRunLogRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionRunLogRepository.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { SpanishDueDateExtractor } from '../../src/contexts/ingestion/infrastructure/extraction/SpanishDueDateExtractor.js';
import { ClassifyInstitutionalMessage } from '../../src/contexts/classification/application/ClassifyInstitutionalMessage.js';
import { ClassificationResult } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { ConfidenceScore } from '../../src/contexts/classification/domain/value-objects/ConfidenceScore.js';
import { ReviewThreshold } from '../../src/contexts/classification/domain/value-objects/ReviewThreshold.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { InMemoryClassificationRetryQueue } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationRetryQueue.js';
import { InMemoryReviewThresholdConfig } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryReviewThresholdConfig.js';
import { InMemoryAdminAlertPort } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryAdminAlertPort.js';
import { InMemoryNotificationSchedulingPort } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryNotificationSchedulingPort.js';

const NOW = new Date('2026-09-21T12:00:00Z');
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function raw(uid: number, subject: string, body: string, sender = 'convocatorias@upb.edu.co'): RawInstitutionalMessage {
  return {
    messageId: MessageId.fromHeader(`<uid-${uid}@upb.edu.co>`),
    mailboxUid: uid,
    sender,
    subject,
    receivedAt: new Date(Date.UTC(2026, 8, 1, 8, uid)),
    rawBody: body
  };
}

const passthroughNormalizer = {
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

/**
 * Clasificador de prueba: el puntaje depende del cuerpo, para poder simular
 * un reenvio que cambia el estado de publicacion. "FALLA" en el asunto
 * simula una caida del proveedor.
 */
const scriptedClassifier = {
  classify: async (message: InstitutionalMessage) => {
    if (message.subject.includes('FALLA')) {
      throw new Error('timeout del proveedor de IA');
    }
    const score = message.body.includes('dudoso') ? 0.3 : 0.9;
    return ClassificationResult.fromCategory(MessageCategory.CONVOCATORIA_CON_PLAZO, {
      confidenceScore: ConfidenceScore.of(score)
    });
  }
};

function buildIngestion(messages: RawInstitutionalMessage[]) {
  const clock = new FixedClock(NOW);
  const registry = new InMemoryProcessedMessageRegistry();
  const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
  const resultRepository = new InMemoryClassificationResultRepository();
  const retryQueue = new InMemoryClassificationRetryQueue();
  const adminAlertPort = new InMemoryAdminAlertPort();
  const notificationSchedulingPort = new InMemoryNotificationSchedulingPort();

  const classifyMessage = new ClassifyInstitutionalMessage({
    classificationPort: scriptedClassifier,
    resultRepository,
    retryQueue,
    reviewThresholdConfig: new InMemoryReviewThresholdConfig(ReviewThreshold.of(0.6)),
    adminAlertPort,
    notificationSchedulingPort,
    clock
  });

  const useCase = new IngestInstitutionalMessages({
    mailbox: new InMemoryMailboxAdapter(messages),
    registry,
    consolidatedRegistry,
    quarantine: new InMemoryQuarantineRepository(),
    cursors: new InMemoryIngestionCursorRepository(),
    logs: new InMemoryIngestionRunLogRepository(),
    idempotency: new IdempotencyPolicy(registry),
    deduplication: new DeduplicationPolicy(consolidatedRegistry),
    deduplicationWindowMs: WINDOW_MS,
    quarantineIncidentPolicy: new QuarantineIncidentPolicy(1),
    normalizer: passthroughNormalizer,
    dueDateExtractor: new SpanishDueDateExtractor(),
    classifyMessage,
    clock,
    batchSize: 50
  });

  return { useCase, consolidatedRegistry, resultRepository, retryQueue, adminAlertPort, notificationSchedulingPort };
}

describe('Ingesta con clasificacion conectada (unificacion HU-06/HU-09/HU-10)', () => {
  it('un mensaje nuevo se clasifica y su resultado se persiste con la hora del reloj inyectado', async () => {
    const ctx = buildIngestion([raw(1, 'Convocatoria movilidad', 'Cierra el 30 de septiembre.')]);

    await ctx.useCase.execute();

    expect(ctx.resultRepository.items).toHaveLength(1);
    expect(ctx.resultRepository.items[0]).toMatchObject({
      messageId: 'uid-1@upb.edu.co',
      confidenceScore: 0.9,
      publicationStatus: 'published',
      persistedAt: NOW
    });
    expect(ctx.notificationSchedulingPort.scheduled).toHaveLength(1);
  });

  it('politica de reenvios: un reenvio con el mismo estado se clasifica pero no vuelve a notificar', async () => {
    const ctx = buildIngestion([
      raw(1, 'Convocatoria movilidad', 'Cierra el 30 de septiembre.'),
      raw(2, 'Convocatoria movilidad', 'Cierra el 30 de septiembre.'),
      raw(3, 'Convocatoria movilidad', 'Recordatorio: cierra el 30 de septiembre.')
    ]);

    await ctx.useCase.execute();

    expect(ctx.consolidatedRegistry.size).toBe(1);
    expect(ctx.resultRepository.items.map((record) => record.messageId)).toEqual([
      'uid-1@upb.edu.co',
      'uid-2@upb.edu.co',
      'uid-3@upb.edu.co'
    ]);
    expect(ctx.notificationSchedulingPort.scheduled).toHaveLength(1);
    expect(ctx.adminAlertPort.alerts).toHaveLength(0);
  });

  it('politica de reenvios: un reenvio en revision pendiente no alerta de nuevo al administrador', async () => {
    const ctx = buildIngestion([
      raw(1, 'Aviso ambiguo', 'Texto dudoso sin fecha.'),
      raw(2, 'Aviso ambiguo', 'Texto dudoso sin fecha, reenviado.')
    ]);

    await ctx.useCase.execute();

    expect(ctx.resultRepository.items.map((record) => record.publicationStatus)).toEqual([
      'pending-review',
      'pending-review'
    ]);
    expect(ctx.adminAlertPort.alerts).toHaveLength(1);
    expect(ctx.notificationSchedulingPort.scheduled).toHaveLength(0);
  });

  it('politica de reenvios: un reenvio que pasa de revision pendiente a publicado si programa notificaciones', async () => {
    const ctx = buildIngestion([
      raw(1, 'Convocatoria becas', 'Texto dudoso sin fecha.'),
      raw(2, 'Convocatoria becas', 'Corregido: cierra el 15 de octubre.')
    ]);

    await ctx.useCase.execute();

    expect(ctx.resultRepository.items.map((record) => record.publicationStatus)).toEqual([
      'pending-review',
      'published'
    ]);
    expect(ctx.adminAlertPort.alerts.map((record) => record.messageId)).toEqual(['uid-1@upb.edu.co']);
    expect(ctx.notificationSchedulingPort.scheduled.map((record) => record.messageId)).toEqual(['uid-2@upb.edu.co']);
  });

  it('un mensaje que ya esta en la cola de reintento y se relee (caida antes de markAsProcessed) no detiene el lote', async () => {
    const ctx = buildIngestion([
      raw(1, 'FALLA proveedor', 'Cualquier texto.'),
      raw(2, 'Convocatoria B', 'Cierra el 30 de septiembre.', 'otra@upb.edu.co')
    ]);
    // Simula la ejecucion anterior interrumpida: la entrada ya quedo en la
    // cola, pero el mensaje nunca se marco como procesado y se vuelve a leer.
    await ctx.retryQueue.save({
      messageId: 'uid-1@upb.edu.co',
      message: passthroughNormalizer.normalize(raw(1, 'FALLA proveedor', 'Cualquier texto.')),
      error: 'fallo de la ejecucion anterior',
      createdAt: new Date('2026-09-20T00:00:00Z')
    });

    const log = await ctx.useCase.execute();

    expect(log.processed).toBe(2);
    expect(ctx.retryQueue.items).toHaveLength(1);
    expect(ctx.retryQueue.items[0]).toMatchObject({
      error: 'timeout del proveedor de IA',
      createdAt: new Date('2026-09-20T00:00:00Z')
    });
    expect(ctx.resultRepository.items.map((record) => record.messageId)).toEqual(['uid-2@upb.edu.co']);
  });

  it('si el clasificador falla, el mensaje va a la cola de reintento y el resto del lote se procesa', async () => {
    const ctx = buildIngestion([
      raw(1, 'Convocatoria A', 'Cierra el 30 de septiembre.'),
      raw(2, 'FALLA proveedor', 'Cualquier texto.', 'otra@upb.edu.co'),
      raw(3, 'Convocatoria C', 'Cierra el 10 de octubre.', 'tercera@upb.edu.co')
    ]);

    const log = await ctx.useCase.execute();

    expect(log.processed).toBe(3);
    expect(ctx.consolidatedRegistry.size).toBe(3);
    expect(ctx.retryQueue.items.map((entry) => entry.messageId)).toEqual(['uid-2@upb.edu.co']);
    expect(ctx.retryQueue.items[0]?.createdAt).toEqual(NOW);
    expect(ctx.resultRepository.items.map((record) => record.messageId)).toEqual([
      'uid-1@upb.edu.co',
      'uid-3@upb.edu.co'
    ]);
  });
});
