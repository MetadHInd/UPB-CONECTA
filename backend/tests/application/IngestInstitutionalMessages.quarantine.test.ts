import { describe, it, expect } from 'vitest';
import { IngestInstitutionalMessages } from '../../src/contexts/ingestion/application/IngestInstitutionalMessages.js';
import { IdempotencyPolicy } from '../../src/contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { DeduplicationPolicy } from '../../src/contexts/ingestion/domain/services/DeduplicationPolicy.js';
import { QuarantineIncidentPolicy } from '../../src/contexts/ingestion/domain/services/QuarantineIncidentPolicy.js';
import { InMemoryProcessedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryProcessedMessageRegistry.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryQuarantineRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryQuarantineRepository.js';
import { InMemoryIngestionCursorRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionCursorRepository.js';
import { InMemoryIngestionRunLogRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionRunLogRepository.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { MimeMessageNormalizerAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/normalization/MimeMessageNormalizerAdapter.js';
import type { RawInstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/RawInstitutionalMessage.js';
import type { UntranslatableMessage } from '../../src/contexts/ingestion/domain/ports/out/MailboxIngestionPort.js';

const DEDUPLICATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Doble de mailbox que simula llamar al callback onUntranslatable durante la
// fetchUnprocessed para mensajes sin identidad, sin lanzar excepcion.
class FakeMailbox {
  private handler: (message: UntranslatableMessage) => void = () => {};
  constructor(
    private readonly messages: readonly RawInstitutionalMessage[],
    private readonly untranslatableCount = 1
  ) {}
  setOnUntranslatable(handler: (message: UntranslatableMessage) => void): void {
    this.handler = handler;
  }
  async fetchUnprocessed(_cursor: any, _batchSize: number): Promise<RawInstitutionalMessage[]> {
    // Simular que los primeros `untranslatableCount` mensajes son no
    // traducibles y notificarlos, devolviendo el resto del lote para que la
    // ejecucion continue sin interrumpir.
    for (let i = 0; i < this.untranslatableCount && i < this.messages.length; i += 1) {
      const uid = this.messages[i]?.mailboxUid;
      if (uid !== undefined) {
        this.handler({ mailboxUid: uid, cause: 'invalid message-id', rawSource: `raw-${uid}` });
      }
    }
    return this.messages.slice(this.untranslatableCount);
  }
}

function buildDependencies(overrides: { quarantineIncidentThresholdRatio?: number } = {}) {
  const registry = new InMemoryProcessedMessageRegistry();
  const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
  const quarantine = new InMemoryQuarantineRepository();
  const cursors = new InMemoryIngestionCursorRepository();
  const logs = new InMemoryIngestionRunLogRepository();
  const clock = new FixedClock(new Date('2026-08-24T10:00:00Z'));

  return {
    registry,
    consolidatedRegistry,
    quarantine,
    cursors,
    logs,
    clock,
    deps: {
      registry,
      consolidatedRegistry,
      quarantine,
      cursors,
      logs,
      idempotency: new IdempotencyPolicy(registry),
      deduplication: new DeduplicationPolicy(consolidatedRegistry),
      deduplicationWindowMs: DEDUPLICATION_WINDOW_MS,
      quarantineIncidentPolicy: new QuarantineIncidentPolicy(overrides.quarantineIncidentThresholdRatio ?? 0.5),
      normalizer: new MimeMessageNormalizerAdapter(),
      clock,
      batchSize: 200
    }
  };
}

describe('IngestInstitutionalMessages — cuarentena (HU-04)', () => {
  it('incrementa el contador quarantined cuando el mailbox reporta untranslatable y continua el lote', async () => {
    const messages = [
      { mailboxUid: 101, messageId: null as any, sender: 'a', subject: 'x', receivedAt: new Date(), rawBody: 'x' },
      { mailboxUid: 102, messageId: { toString: () => 'mid-102' } as any, sender: 'b', subject: 'y', receivedAt: new Date(), rawBody: 'y' }
    ];

    const mailbox = new FakeMailbox(messages);
    const { deps } = buildDependencies();
    const useCase = new IngestInstitutionalMessages({ mailbox: mailbox as any, ...deps });

    const log = await useCase.execute();
    expect(log.quarantined).toBe(1);
    // El lote retornado fue procesado/duplicado correctamente (las cuarentenas
    // se contabilizan por fuera del lote traducido).
    expect(log.processed + log.duplicated).toBe(log.read);
  });

  it('criterio 1 y 3: persiste el mensaje en cuarentena con su causa y contenido crudo original', async () => {
    const messages = [
      { mailboxUid: 101, messageId: null as any, sender: 'a', subject: 'x', receivedAt: new Date(), rawBody: 'x' },
      { mailboxUid: 102, messageId: { toString: () => 'mid-102' } as any, sender: 'b', subject: 'y', receivedAt: new Date(), rawBody: 'y' }
    ];

    const mailbox = new FakeMailbox(messages);
    const { deps, quarantine } = buildDependencies();
    const useCase = new IngestInstitutionalMessages({ mailbox: mailbox as any, ...deps });

    await useCase.execute();

    const stored = await quarantine.findByUid(101);
    expect(stored?.cause).toBe('invalid message-id');
    expect(stored?.rawSource).toBe('raw-101');
    expect(stored?.quarantinedAt).toEqual(new Date('2026-08-24T10:00:00Z'));
  });

  it('criterio 4: marca la ejecucion para revision prioritaria cuando la cuarentena supera el umbral', async () => {
    const messages = [
      { mailboxUid: 101, messageId: null as any, sender: 'a', subject: 'x', receivedAt: new Date(), rawBody: 'x' },
      { mailboxUid: 102, messageId: null as any, sender: 'a', subject: 'x', receivedAt: new Date(), rawBody: 'x' },
      { mailboxUid: 103, messageId: { toString: () => 'mid-103' } as any, sender: 'b', subject: 'y', receivedAt: new Date(), rawBody: 'y' }
    ];

    // 2 de 3 mensajes en cuarentena (66%) supera un umbral del 50%.
    const mailbox = new FakeMailbox(messages, 2);
    const { deps } = buildDependencies({ quarantineIncidentThresholdRatio: 0.5 });
    const useCase = new IngestInstitutionalMessages({ mailbox: mailbox as any, ...deps });

    const log = await useCase.execute();
    expect(log.priorityReview).toBe(true);
  });

  it('criterio 4: no marca revision prioritaria cuando la cuarentena esta dentro del umbral', async () => {
    const messages = [
      { mailboxUid: 101, messageId: null as any, sender: 'a', subject: 'x', receivedAt: new Date(), rawBody: 'x' },
      { mailboxUid: 102, messageId: { toString: () => 'mid-102' } as any, sender: 'b', subject: 'y', receivedAt: new Date(), rawBody: 'y' }
    ];

    const mailbox = new FakeMailbox(messages, 1); // 1 de 2 = 50%, umbral 50% no se supera
    const { deps } = buildDependencies({ quarantineIncidentThresholdRatio: 0.5 });
    const useCase = new IngestInstitutionalMessages({ mailbox: mailbox as any, ...deps });

    const log = await useCase.execute();
    expect(log.priorityReview).toBe(false);
  });
});
