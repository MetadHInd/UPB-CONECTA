import { describe, it, expect, beforeEach } from 'vitest';
import { IngestInstitutionalMessages } from '../../src/contexts/ingestion/application/IngestInstitutionalMessages.js';
import { IdempotencyPolicy } from '../../src/contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { DeduplicationPolicy } from '../../src/contexts/ingestion/domain/services/DeduplicationPolicy.js';
import { MailboxUnavailableError } from '../../src/contexts/ingestion/domain/ports/out/MailboxIngestionPort.js';
import type { ProcessedMessageRegistryPort } from '../../src/contexts/ingestion/domain/ports/out/ProcessedMessageRegistryPort.js';
import type { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import { InMemoryMailboxAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryMailboxAdapter.js';
import { InMemoryProcessedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryProcessedMessageRegistry.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryIngestionCursorRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionCursorRepository.js';
import { InMemoryIngestionRunLogRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionRunLogRepository.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { MimeMessageNormalizerAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/normalization/MimeMessageNormalizerAdapter.js';
import { buildFixtureMessages } from '../../src/contexts/ingestion/infrastructure/fixtures/institutionalMessages.js';

const DEDUPLICATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function buildUseCase(overrides: { registry?: ProcessedMessageRegistryPort; deduplicationWindowMs?: number } = {}) {
  const mailbox = new InMemoryMailboxAdapter(buildFixtureMessages());
  const registry = overrides.registry ?? new InMemoryProcessedMessageRegistry();
  const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
  const cursors = new InMemoryIngestionCursorRepository();
  const logs = new InMemoryIngestionRunLogRepository();
  const clock = new FixedClock(new Date('2026-08-24T10:00:00Z'));

  const useCase = new IngestInstitutionalMessages({
    mailbox,
    registry,
    consolidatedRegistry,
    cursors,
    logs,
    idempotency: new IdempotencyPolicy(registry),
    deduplication: new DeduplicationPolicy(consolidatedRegistry),
    deduplicationWindowMs: overrides.deduplicationWindowMs ?? DEDUPLICATION_WINDOW_MS,
    normalizer: new MimeMessageNormalizerAdapter(),
    clock,
    batchSize: 200
  });

  return { useCase, mailbox, registry, consolidatedRegistry, cursors, logs, clock };
}

describe('IngestInstitutionalMessages, CU-01', () => {
  let ctx: ReturnType<typeof buildUseCase>;

  beforeEach(() => {
    ctx = buildUseCase();
  });

  it('procesa el lote completo en la primera ejecucion', async () => {
    const log = await ctx.useCase.execute();

    expect(log.read).toBe(5);
    expect(log.processed).toBe(5);
    expect(log.duplicated).toBe(0);
    expect(log.finishedAt).not.toBeNull();
  });

  it('criterio 3: la reejecucion sobre el mismo lote no genera documentos nuevos', async () => {
    const primera = await ctx.useCase.execute();
    expect(primera.processed).toBe(5);

    // Se reinicia el punto de lectura para forzar la relectura del mismo lote,
    // que es el escenario que el criterio de aceptacion describe.
    const { IngestionCursor } = await import(
      '../../src/contexts/ingestion/domain/value-objects/IngestionCursor.js'
    );
    await ctx.cursors.save(IngestionCursor.initial());

    const segunda = await ctx.useCase.execute();
    expect(segunda.read).toBe(5);
    expect(segunda.processed).toBe(0);
    expect(segunda.duplicated).toBe(5);
    expect((ctx.registry as InMemoryProcessedMessageRegistry).size).toBe(5);
  });

  it('no relee lo confirmado cuando el cursor avanza con normalidad', async () => {
    await ctx.useCase.execute();
    const segunda = await ctx.useCase.execute();

    expect(segunda.read).toBe(0);
    expect(segunda.processed).toBe(0);
    expect((await ctx.cursors.load()).lastConfirmedUid).toBe(105);
  });

  it('criterio 5: ante un fallo a mitad de lote conserva el punto de lectura confirmado', async () => {
    const registryConFallo: ProcessedMessageRegistryPort = {
      hasBeenProcessed: async () => false,
      markAsProcessed: async (_id: MessageId, mailboxUid: number) => {
        if (mailboxUid === 103) throw new Error('fallo de escritura simulado en el uid 103');
      }
    };

    const conFallo = buildUseCase({ registry: registryConFallo });
    await expect(conFallo.useCase.execute()).rejects.toThrow('fallo de escritura simulado');

    // Confirmados 101 y 102, el 103 fallo: el cursor no salta ni retrocede.
    expect((await conFallo.cursors.load()).lastConfirmedUid).toBe(102);

    const bitacora = conFallo.logs.saved.at(-1);
    expect(bitacora?.hasIncidents).toBe(true);
    expect(bitacora?.incidents[0]?.cause).toContain('uid 103');
  });

  it('propaga la indisponibilidad del buzon sin perder el punto de lectura', async () => {
    await ctx.useCase.execute();
    ctx.mailbox.simulateUnavailability('tiempo de espera agotado');

    await expect(ctx.useCase.execute()).rejects.toThrow(MailboxUnavailableError);
    expect((await ctx.cursors.load()).lastConfirmedUid).toBe(105);
  });

  it('procesa en orden ascendente de uid aunque el buzon devuelva desordenado', async () => {
    const desordenado = [...buildFixtureMessages()].reverse();
    const mailbox = new InMemoryMailboxAdapter(desordenado);
    const registry = new InMemoryProcessedMessageRegistry();
    const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
    const cursors = new InMemoryIngestionCursorRepository();

    const useCase = new IngestInstitutionalMessages({
      mailbox,
      registry,
      consolidatedRegistry,
      cursors,
      logs: new InMemoryIngestionRunLogRepository(),
      idempotency: new IdempotencyPolicy(registry),
      deduplication: new DeduplicationPolicy(consolidatedRegistry),
      deduplicationWindowMs: DEDUPLICATION_WINDOW_MS,
      normalizer: new MimeMessageNormalizerAdapter(),
      clock: new FixedClock(new Date('2026-08-24T10:00:00Z')),
      batchSize: 200
    });

    await useCase.execute();
    expect((await cursors.load()).lastConfirmedUid).toBe(105);
  });

  it('respeta el tamano de lote configurado', async () => {
    const registry = new InMemoryProcessedMessageRegistry();
    const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
    const cursors = new InMemoryIngestionCursorRepository();
    const useCase = new IngestInstitutionalMessages({
      mailbox: new InMemoryMailboxAdapter(buildFixtureMessages()),
      registry,
      consolidatedRegistry,
      cursors,
      logs: new InMemoryIngestionRunLogRepository(),
      idempotency: new IdempotencyPolicy(registry),
      deduplication: new DeduplicationPolicy(consolidatedRegistry),
      deduplicationWindowMs: DEDUPLICATION_WINDOW_MS,
      normalizer: new MimeMessageNormalizerAdapter(),
      clock: new FixedClock(new Date('2026-08-24T10:00:00Z')),
      batchSize: 2
    });

    const log = await useCase.execute();
    expect(log.read).toBe(2);
    expect((await cursors.load()).lastConfirmedUid).toBe(102);
  });

  it('rechaza un tamano de lote invalido en la construccion', () => {
    const registry = new InMemoryProcessedMessageRegistry();
    const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
    expect(
      () =>
        new IngestInstitutionalMessages({
          mailbox: new InMemoryMailboxAdapter([]),
          registry,
          consolidatedRegistry,
          cursors: new InMemoryIngestionCursorRepository(),
          logs: new InMemoryIngestionRunLogRepository(),
          idempotency: new IdempotencyPolicy(registry),
          deduplication: new DeduplicationPolicy(consolidatedRegistry),
          deduplicationWindowMs: DEDUPLICATION_WINDOW_MS,
          normalizer: new MimeMessageNormalizerAdapter(),
          clock: new FixedClock(new Date()),
          batchSize: 0
        })
    ).toThrow(RangeError);
  });

  it('registra la bitacora de cada ejecucion completada', async () => {
    await ctx.useCase.execute();
    expect(ctx.logs.saved).toHaveLength(1);
    expect(ctx.logs.saved[0]?.startedAt).toEqual(new Date('2026-08-24T10:00:00Z'));
  });

  it('HU-03: consolida el recordatorio del uid 105 con el aviso original del uid 101', async () => {
    await ctx.useCase.execute();

    const consolidado = await ctx.consolidatedRegistry.findWithinWindow(
      'idiomas@upb.edu.co',
      'Apertura de inscripciones curso de ingles 2026-20',
      new Date('2026-08-11T13:00:00Z'),
      DEDUPLICATION_WINDOW_MS
    );

    expect(consolidado).not.toBeNull();
    expect(consolidado?.firstSentAt).toEqual(new Date('2026-08-03T13:05:00Z'));
    expect(consolidado?.lastSentAt).toEqual(new Date('2026-08-11T13:00:00Z'));
    expect(consolidado?.resendCount).toBe(1);
    expect(ctx.consolidatedRegistry.size).toBe(4); // 5 mensajes, 2 se consolidan en 1 grupo
  });

  it('HU-03: fuera de la ventana el mismo asunto genera un grupo nuevo, no se consolida', async () => {
    const { useCase, consolidatedRegistry } = buildUseCase({ deduplicationWindowMs: 24 * 60 * 60 * 1000 });
    await useCase.execute();

    expect(consolidatedRegistry.size).toBe(5); // ventana de 24h: el recordatorio del dia 11 no entra en la del dia 3
  });

  it('HU-03 criterio 5: un reenvio con cuerpo modificado actualiza el documento existente', async () => {
    const { MessageId } = await import('../../src/contexts/ingestion/domain/value-objects/MessageId.js');
    const original: import('../../src/contexts/ingestion/domain/entities/RawInstitutionalMessage.js').RawInstitutionalMessage = {
      messageId: MessageId.fromHeader('<a@upb.edu.co>'),
      mailboxUid: 201,
      sender: 'idiomas@upb.edu.co',
      subject: 'Convocatoria examen de suficiencia',
      receivedAt: new Date('2026-09-10T08:00:00Z'),
      rawBody: `From: Idiomas <idiomas@upb.edu.co>
Subject: Convocatoria examen de suficiencia
Content-Type: text/plain; charset=us-ascii

cierre 20 de septiembre`
    };
    const reenvioConCambio: typeof original = {
      ...original,
      messageId: MessageId.fromHeader('<b@upb.edu.co>'),
      mailboxUid: 202,
      receivedAt: new Date('2026-09-10T10:00:00Z'),
      rawBody: `From: Idiomas <idiomas@upb.edu.co>
Subject: Convocatoria examen de suficiencia
Content-Type: text/plain; charset=us-ascii

cierre extendido al 27 de septiembre`
    };

    const mailbox = new InMemoryMailboxAdapter([original, reenvioConCambio]);
    const registry = new InMemoryProcessedMessageRegistry();
    const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
    const useCase = new IngestInstitutionalMessages({
      mailbox,
      registry,
      consolidatedRegistry,
      cursors: new InMemoryIngestionCursorRepository(),
      logs: new InMemoryIngestionRunLogRepository(),
      idempotency: new IdempotencyPolicy(registry),
      deduplication: new DeduplicationPolicy(consolidatedRegistry),
      deduplicationWindowMs: DEDUPLICATION_WINDOW_MS,
      normalizer: new MimeMessageNormalizerAdapter(),
      clock: new FixedClock(new Date('2026-09-10T10:00:00Z')),
      batchSize: 200
    });

    await useCase.execute();

    expect(consolidatedRegistry.size).toBe(1);
    const consolidado = await consolidatedRegistry.findWithinWindow(
      'idiomas@upb.edu.co',
      'Convocatoria examen de suficiencia',
      new Date('2026-09-10T10:00:00Z'),
      DEDUPLICATION_WINDOW_MS
    );
    expect(consolidado?.body).toContain('27 de septiembre');
    expect(consolidado?.resendCount).toBe(1);
  });
});
