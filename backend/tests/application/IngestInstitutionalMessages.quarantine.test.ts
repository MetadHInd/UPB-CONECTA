import { describe, it, expect } from 'vitest';
import { IngestInstitutionalMessages } from '../../src/contexts/ingestion/application/IngestInstitutionalMessages.js';
import { IdempotencyPolicy } from '../../src/contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { InMemoryProcessedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryProcessedMessageRegistry.js';
import { InMemoryIngestionCursorRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionCursorRepository.js';
import { InMemoryIngestionRunLogRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionRunLogRepository.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import type { RawInstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/RawInstitutionalMessage.js';

// Doble de mailbox que simula llamar al callback onUntranslatable durante la
// fetchUnprocessed para mensajes sin identidad, sin lanzar excepcion.
class FakeMailbox {
  private handler: (uid: number, cause: string) => void = () => {};
  constructor(private readonly messages: readonly RawInstitutionalMessage[]) {}
  setOnUntranslatable(handler: (uid: number, cause: string) => void): void {
    this.handler = handler;
  }
  async fetchUnprocessed(_cursor: any, _batchSize: number): Promise<RawInstitutionalMessage[]> {
    // Simular que el primer mensaje es no traducible y notificar, y devolver
    // el resto del lote para que la ejecucion continue sin interrumpir.
    if (this.messages.length > 0) {
      const uid = this.messages[0]?.mailboxUid;
      if (uid !== undefined) this.handler(uid, 'invalid message-id');
    }
    return this.messages.slice(1);
  }
}

describe('IngestInstitutionalMessages — cuarentena (Opcion A)', () => {
  it('incrementa el contador quarantined cuando el mailbox reporta untranslatable y continua el lote', async () => {
    // Fixture: dos mensajes
    const messages = [
      { mailboxUid: 101, messageId: null as any, sender: 'a', subject: 'x', receivedAt: new Date(), rawBody: 'x' },
      { mailboxUid: 102, messageId: { toString: () => 'mid-102' } as any, sender: 'b', subject: 'y', receivedAt: new Date(), rawBody: 'y' }
    ];

    const mailbox = new FakeMailbox(messages);
    const registry = new InMemoryProcessedMessageRegistry();
    const cursors = new InMemoryIngestionCursorRepository();
    const logs = new InMemoryIngestionRunLogRepository();
    const clock = new FixedClock(new Date('2026-08-24T10:00:00Z'));

    const useCase = new IngestInstitutionalMessages({
      mailbox: mailbox as any,
      registry,
      cursors,
      logs,
      idempotency: new IdempotencyPolicy(registry),
      clock,
      batchSize: 200
    });

    const log = await useCase.execute();
    // debug: counters available on `log` for inspection during TDD
    expect(log.quarantined).toBe(1);
    // El lote retornado fue procesado/duplicado correctamente (las cuarentenas
    // se contabilizan por fuera del lote traducido).
    expect(log.processed + log.duplicated).toBe(log.read);
  });
});
