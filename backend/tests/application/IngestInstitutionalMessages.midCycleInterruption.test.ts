import { describe, it, expect } from 'vitest';
import { IngestInstitutionalMessages } from '../../src/contexts/ingestion/application/IngestInstitutionalMessages.js';
import { IdempotencyPolicy } from '../../src/contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { DeduplicationPolicy } from '../../src/contexts/ingestion/domain/services/DeduplicationPolicy.js';
import { QuarantineIncidentPolicy } from '../../src/contexts/ingestion/domain/services/QuarantineIncidentPolicy.js';
import type {
  ConsolidatedMessageRecord,
  ConsolidatedMessageRegistryPort
} from '../../src/contexts/ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { IngestionCursorRepositoryPort } from '../../src/contexts/ingestion/domain/ports/out/IngestionCursorRepositoryPort.js';
import type { IngestionCursor } from '../../src/contexts/ingestion/domain/value-objects/IngestionCursor.js';
import { InMemoryMailboxAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryMailboxAdapter.js';
import { InMemoryProcessedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryProcessedMessageRegistry.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryQuarantineRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryQuarantineRepository.js';
import { InMemoryIngestionCursorRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionCursorRepository.js';
import { InMemoryIngestionRunLogRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionRunLogRepository.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { MimeMessageNormalizerAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/normalization/MimeMessageNormalizerAdapter.js';
import { SpanishDueDateExtractor } from '../../src/contexts/ingestion/infrastructure/extraction/SpanishDueDateExtractor.js';
import { buildSyntheticMessages } from '../../src/contexts/ingestion/infrastructure/fixtures/syntheticMessages.js';

const DEDUPLICATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CLOCK = new FixedClock(new Date('2026-09-25T10:00:00Z'));

/**
 * Envuelve un `ConsolidatedMessageRegistryPort` real y lanza una excepcion en
 * la N-esima llamada a `save`, simulando que el proceso se interrumpe (caida
 * de conexion, kill del proceso, etc.) a mitad de la escritura de un mensaje
 * dentro de un ciclo de ingesta — no antes de empezar el ciclo (eso ya lo
 * cubre HU-55 criterio 4 con el buzon caido), sino en medio de el, despues de
 * haber consolidado con exito algunos mensajes anteriores del mismo lote.
 */
class InterruptingConsolidatedMessageRegistry implements ConsolidatedMessageRegistryPort {
  private saveCalls = 0;

  constructor(
    private readonly inner: ConsolidatedMessageRegistryPort,
    private readonly failOnCallNumber: number,
    private readonly cause: string
  ) {}

  findWithinWindow(sender: string, subject: string, referenceDate: Date, windowMs: number) {
    return this.inner.findWithinWindow(sender, subject, referenceDate, windowMs);
  }

  findById(id: Parameters<ConsolidatedMessageRegistryPort['findById']>[0]) {
    return this.inner.findById(id);
  }

  findByRepresentativeMessageId(messageId: string) {
    return this.inner.findByRepresentativeMessageId(messageId);
  }

  async save(record: ConsolidatedMessageRecord): Promise<void> {
    this.saveCalls += 1;
    if (this.saveCalls === this.failOnCallNumber) {
      throw new Error(this.cause);
    }
    return this.inner.save(record);
  }
}

/**
 * Envuelve un `IngestionCursorRepositoryPort` real y hace que `save` falle
 * una unica vez, simulando que el proceso se interrumpe justo al persistir el
 * cursor al final de un ciclo — el escenario mas duro: ni siquiera el punto
 * de lectura queda actualizado, y toda la garantia recae en la idempotencia
 * por Message-ID (HU-01) en vez de en el cursor (RF-02, criterio 5).
 */
class CrashOnceCursorRepository implements IngestionCursorRepositoryPort {
  private crashed = false;

  constructor(
    private readonly inner: IngestionCursorRepositoryPort,
    private readonly cause: string
  ) {}

  load(): Promise<IngestionCursor> {
    return this.inner.load();
  }

  async save(cursor: IngestionCursor): Promise<void> {
    if (!this.crashed) {
      this.crashed = true;
      throw new Error(this.cause);
    }
    return this.inner.save(cursor);
  }
}

function buildUseCase(deps: {
  mailbox: InMemoryMailboxAdapter;
  registry: InMemoryProcessedMessageRegistry;
  consolidatedRegistry: ConsolidatedMessageRegistryPort;
  cursors: IngestionCursorRepositoryPort;
  logs: InMemoryIngestionRunLogRepository;
  batchSize: number;
}): IngestInstitutionalMessages {
  return new IngestInstitutionalMessages({
    mailbox: deps.mailbox,
    registry: deps.registry,
    consolidatedRegistry: deps.consolidatedRegistry,
    quarantine: new InMemoryQuarantineRepository(),
    cursors: deps.cursors,
    logs: deps.logs,
    idempotency: new IdempotencyPolicy(deps.registry),
    deduplication: new DeduplicationPolicy(deps.consolidatedRegistry),
    deduplicationWindowMs: DEDUPLICATION_WINDOW_MS,
    quarantineIncidentPolicy: new QuarantineIncidentPolicy(1),
    normalizer: new MimeMessageNormalizerAdapter(),
    dueDateExtractor: new SpanishDueDateExtractor(),
    clock: CLOCK,
    batchSize: deps.batchSize
  });
}

/**
 * HU-55, criterio 6: "Dado cualquier interrupcion del proceso, cuando se
 * simula, entonces no se pierde un mensaje del buzon ni una publicacion
 * enviada por un estudiante." La primera mitad (mensajes del buzon) tiene dos
 * escenarios genuinamente distintos, ambos cubiertos aqui:
 *
 * 1. La interrupcion ocurre a mitad de un lote, no antes de leerlo (distinto
 *    de HU-55 criterio 4, que cubre el buzon caido *antes* de empezar el
 *    ciclo). El cursor (RF-02, criterio 5) conserva el ultimo mensaje
 *    confirmado y el reinicio retoma justo despues, sin releer ni saltarse
 *    nada.
 * 2. La interrupcion es tan abrupta que ni siquiera el cursor llega a
 *    persistirse. Ahi la garantia es la idempotencia por Message-ID (HU-01):
 *    el buzon puede reentregar mensajes ya consolidados y el reintento los
 *    descarta como duplicados en vez de consolidarlos otra vez.
 */
describe('HU-55 criterio 6 — un ciclo de ingesta interrumpido a mitad de camino no pierde ni duplica mensajes', () => {
  it('el cursor conserva el ultimo mensaje confirmado: el reinicio retoma justo despues, sin perder ni duplicar nada', async () => {
    const messages = buildSyntheticMessages(10);
    const mailbox = new InMemoryMailboxAdapter(messages);
    const registry = new InMemoryProcessedMessageRegistry();
    const consolidated = new InMemoryConsolidatedMessageRegistry();
    const cursors = new InMemoryIngestionCursorRepository();

    const FAIL_ON_SAVE_NUMBER = 6; // el sexto mensaje del lote (indice 5) no llega a consolidarse
    const flaky = new InterruptingConsolidatedMessageRegistry(
      consolidated,
      FAIL_ON_SAVE_NUMBER,
      'interrupcion simulada del proceso a mitad de un ciclo de ingesta'
    );

    const run1 = buildUseCase({
      mailbox,
      registry,
      consolidatedRegistry: flaky,
      cursors,
      logs: new InMemoryIngestionRunLogRepository(),
      batchSize: 200
    });

    await expect(run1.execute()).rejects.toThrow(/interrupcion simulada/);

    // Los primeros 5 mensajes quedaron consolidados y marcados como
    // procesados; el sexto (el que interrumpio el ciclo) no dejo rastro
    // parcial — ni documento consolidado, ni marca de procesado.
    expect(consolidated.size).toBe(5);
    expect(registry.size).toBe(5);
    for (const message of messages.slice(0, 5)) {
      expect(await registry.hasBeenProcessed(message.messageId)).toBe(true);
    }
    for (const message of messages.slice(5)) {
      expect(await registry.hasBeenProcessed(message.messageId)).toBe(false);
    }

    // El cursor quedo exactamente en el quinto mensaje confirmado (RF-02, criterio 5).
    const cursorAfterCrash = await cursors.load();
    expect(cursorAfterCrash.lastConfirmedUid).toBe(messages[4]!.mailboxUid);

    // Reinicio del proceso: nueva instancia del caso de uso sobre el mismo
    // buzon (que todavia contiene los 10 mensajes, incluido el sexto que
    // fallo) y los mismos registros/cursor durables. La interrupcion ya no
    // ocurre (era transitoria).
    const run2 = buildUseCase({
      mailbox,
      registry,
      consolidatedRegistry: consolidated,
      cursors,
      logs: new InMemoryIngestionRunLogRepository(),
      batchSize: 200
    });
    const log2 = await run2.execute();

    // El reinicio solo leyo y proceso los 5 mensajes pendientes (uid > cursor);
    // no releyo los primeros 5 (el cursor los excluyo antes de que el
    // idempotency policy siquiera los viera).
    expect(log2.read).toBe(5);
    expect(log2.processed).toBe(5);
    expect(log2.duplicated).toBe(0);

    // Nada se perdio (los 10 mensajes terminaron consolidados) y nada se
    // duplico (exactamente 10 documentos consolidados, uno por mensaje —
    // los asuntos son unicos por construccion de `buildSyntheticMessages`).
    expect(consolidated.size).toBe(10);
    expect(registry.size).toBe(10);
    for (const message of messages) {
      expect(await registry.hasBeenProcessed(message.messageId)).toBe(true);
    }
    const sixthMessage = messages[5]!;
    const consolidatedSixth = await consolidated.findWithinWindow(
      sixthMessage.sender,
      sixthMessage.subject,
      sixthMessage.receivedAt,
      DEDUPLICATION_WINDOW_MS
    );
    expect(consolidatedSixth).not.toBeNull();
    expect(consolidatedSixth?.representativeMessageId).toBe(sixthMessage.messageId.toString());

    expect((await cursors.load()).lastConfirmedUid).toBe(messages[9]!.mailboxUid);
  });

  it('incluso si la interrupcion impide persistir el cursor, la idempotencia por Message-ID evita duplicar lo ya consolidado al reintentar', async () => {
    const messages = buildSyntheticMessages(10);
    const mailbox = new InMemoryMailboxAdapter(messages);
    const registry = new InMemoryProcessedMessageRegistry();
    const consolidated = new InMemoryConsolidatedMessageRegistry();
    const realCursors = new InMemoryIngestionCursorRepository();
    const crashingCursors = new CrashOnceCursorRepository(
      realCursors,
      'interrupcion simulada justo al persistir el cursor, al final del ciclo'
    );

    // batchSize=5: el primer ciclo procesa exactamente los primeros 5
    // mensajes, termina el lote con normalidad (sin ningun error de negocio)
    // y solo entonces se interrumpe, en el ultimo paso: persistir el cursor.
    const run1 = buildUseCase({
      mailbox,
      registry,
      consolidatedRegistry: consolidated,
      cursors: crashingCursors,
      logs: new InMemoryIngestionRunLogRepository(),
      batchSize: 5
    });

    await expect(run1.execute()).rejects.toThrow(/interrupcion simulada justo al persistir el cursor/);

    // Los 5 mensajes si quedaron consolidados y marcados como procesados
    // (esas escrituras ya se habian confirmado antes de que fallara el
    // cursor), pero el cursor durable sigue en su valor inicial.
    expect(consolidated.size).toBe(5);
    expect(registry.size).toBe(5);
    expect((await realCursors.load()).lastConfirmedUid).toBe(0);

    // Reinicio: el cursor durable todavia esta en 0, asi que el buzon vuelve
    // a entregar los 10 mensajes, incluidos los 5 ya consolidados.
    const run2 = buildUseCase({
      mailbox,
      registry,
      consolidatedRegistry: consolidated,
      cursors: realCursors,
      logs: new InMemoryIngestionRunLogRepository(),
      batchSize: 200
    });
    const log2 = await run2.execute();

    // Los primeros 5 se descartan como duplicados por Message-ID (HU-01); solo
    // los 5 restantes se procesan como nuevos.
    expect(log2.read).toBe(10);
    expect(log2.duplicated).toBe(5);
    expect(log2.processed).toBe(5);

    // Nada se perdio ni se duplico: siguen siendo exactamente 10 documentos
    // consolidados (uno por mensaje), pese a que 5 de ellos se reentregaron.
    expect(consolidated.size).toBe(10);
    expect(registry.size).toBe(10);
    for (const message of messages) {
      expect(await registry.hasBeenProcessed(message.messageId)).toBe(true);
    }
    expect((await realCursors.load()).lastConfirmedUid).toBe(messages[9]!.mailboxUid);
  });
});
