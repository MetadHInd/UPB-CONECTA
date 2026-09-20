import { describe, it, expect } from 'vitest';
import { IngestInstitutionalMessages } from '../../src/contexts/ingestion/application/IngestInstitutionalMessages.js';
import { InMemoryQuarantineRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryQuarantineRepository.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryProcessedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryProcessedMessageRegistry.js';
import { InMemoryIngestionCursorRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionCursorRepository.js';
import { InMemoryIngestionRunLogRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionRunLogRepository.js';
import { InMemoryIngestionCursorRepository as CursorRepo } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionCursorRepository.js';
import { InMemoryIngestionRunLogRepository as LogRepo } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionRunLogRepository.js';
import { ImapMailboxAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/imap/ImapMailboxAdapter.js';
import type { ImapClient } from '../../src/contexts/ingestion/infrastructure/adapters/out/imap/ImapMailboxAdapter.js';
import { InMemoryProcessedMessageRegistry as ProcReg } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryProcessedMessageRegistry.js';
import { IdempotencyPolicy } from '../../src/contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { DeduplicationPolicy } from '../../src/contexts/ingestion/domain/services/DeduplicationPolicy.js';
import { InMemoryConsolidatedMessageRegistry as ConsolidatedReg } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryQuarantineRepository as QuarantineReg } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryQuarantineRepository.js';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import { IngestionCursor } from '../../src/contexts/ingestion/domain/value-objects/IngestionCursor.js';
import { SystemClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';

class FakeImapClient implements ImapClient {
  async connect(): Promise<void> {}
  async logout(): Promise<void> {}
  async openMailbox(_name: string): Promise<void> {}
  async fetchSince(_uid: number, _limit: number) {
    return [
      {
        uid: 1,
        headers: {}, // no message-id header -> InvalidMessageIdError in adapter
        from: 'sender',
        subject: 's',
        date: new Date(),
        source: 'raw'
      }
    ];
  }
}

describe('Quarantine exclusion', () => {
  it('messages without valid Message-ID are quarantined and not consolidated', async () => {
    const quarantine = new QuarantineReg();
    const consolidated = new ConsolidatedReg();
    const processed = new ProcReg();
    const cursors = new CursorRepo();
    const logs = new LogRepo();

    const fakeClient = new FakeImapClient();
    const mailbox = new ImapMailboxAdapter(fakeClient, 'INBOX');

    const useCase = new IngestInstitutionalMessages({
      mailbox,
      registry: processed,
      consolidatedRegistry: consolidated,
      quarantine,
      cursors,
      logs,
      idempotency: new IdempotencyPolicy(processed),
      deduplication: new DeduplicationPolicy(consolidated),
      deduplicationWindowMs: 1000 * 60 * 60,
      quarantineIncidentPolicy: { exceedsThreshold: () => false },
      normalizer: { normalize: (m: any) => { throw new Error('should not be called'); } },
      dueDateExtractor: { extract: () => ({ dueDate: null, applicationLink: null }) },
      classifier: undefined,
      classificationRetryQueue: undefined,
      classificationResultRepository: undefined,
      clock: new SystemClock(),
      batchSize: 10
    } as any);

    await useCase.execute();

    expect(quarantine.size).toBe(1);
    expect(consolidated.size).toBe(0);
  });
});
