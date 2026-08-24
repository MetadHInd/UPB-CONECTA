import { IngestionRunLog } from '../domain/entities/IngestionRunLog.js';
import type { RawInstitutionalMessage } from '../domain/entities/RawInstitutionalMessage.js';
import type { IngestionCursor } from '../domain/value-objects/IngestionCursor.js';
import type { IdempotencyPolicy } from '../domain/services/IdempotencyPolicy.js';
import type { MailboxIngestionPort } from '../domain/ports/out/MailboxIngestionPort.js';
import type { ProcessedMessageRegistryPort } from '../domain/ports/out/ProcessedMessageRegistryPort.js';
import type { IngestionCursorRepositoryPort } from '../domain/ports/out/IngestionCursorRepositoryPort.js';
import type { IngestionRunLogRepositoryPort } from '../domain/ports/out/IngestionRunLogRepositoryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { IngestInstitutionalMessagesPort } from '../domain/ports/in/IngestInstitutionalMessagesPort.js';

export interface IngestInstitutionalMessagesDependencies {
  readonly mailbox: MailboxIngestionPort;
  readonly registry: ProcessedMessageRegistryPort;
  readonly cursors: IngestionCursorRepositoryPort;
  readonly logs: IngestionRunLogRepositoryPort;
  readonly idempotency: IdempotencyPolicy;
  readonly clock: ClockPort;
  readonly batchSize: number;
}

/**
 * Caso de uso CU-01, pasos 1, 2 y 5, mas el flujo alternativo A.
 *
 * Orquesta la ingesta sin conocer IMAP ni MongoDB: recibe puertos y decide con
 * politicas de dominio. Esa ignorancia es lo que permite ejecutarlo completo
 * contra dobles en memoria mientras la Universidad habilita el buzon real.
 */
export class IngestInstitutionalMessages implements IngestInstitutionalMessagesPort {
  constructor(private readonly deps: IngestInstitutionalMessagesDependencies) {
    if (!Number.isInteger(deps.batchSize) || deps.batchSize <= 0) {
      throw new RangeError(`El tamano de lote debe ser un entero positivo, se recibio ${deps.batchSize}`);
    }
  }

  async execute(): Promise<IngestionRunLog> {
    const { mailbox, cursors, logs, clock, batchSize } = this.deps;
    const log = new IngestionRunLog(clock.now());

    let cursor = await cursors.load();
    const batch = await mailbox.fetchUnprocessed(cursor, batchSize);

    for (const message of this.inAscendingUidOrder(batch)) {
      log.recordRead();
      try {
        cursor = await this.handle(message, cursor, log);
      } catch (error) {
        // Se conserva el punto de lectura del ultimo mensaje confirmado, de modo
        // que la siguiente ejecucion no reprocesa lo confirmado ni se salta este.
        log.recordIncident(message.messageId.toString(), this.describe(error), clock.now());
        await this.persist(cursor, log);
        throw error;
      }
    }

    log.finish(clock.now());
    await this.persist(cursor, log);
    await logs.save(log);
    return log;
  }

  private async handle(
    message: RawInstitutionalMessage,
    cursor: IngestionCursor,
    log: IngestionRunLog
  ): Promise<IngestionCursor> {
    const { registry, idempotency, clock } = this.deps;
    const decision = await idempotency.decide(message);

    if (decision.kind === 'discard-duplicate') {
      log.recordDuplicate();
      // El duplicado tambien confirma lectura: sin este avance el cursor se
      // quedaria anclado y el lote se releeria de forma indefinida.
      return cursor.advanceTo(message.mailboxUid, clock.now());
    }

    await registry.markAsProcessed(message.messageId, message.mailboxUid, clock.now());
    log.recordProcessed();
    return cursor.advanceTo(message.mailboxUid, clock.now());
  }

  private async persist(cursor: IngestionCursor, log: IngestionRunLog): Promise<void> {
    await this.deps.cursors.save(cursor);
    if (log.finishedAt === null) {
      await this.deps.logs.save(log);
    }
  }

  private inAscendingUidOrder(batch: readonly RawInstitutionalMessage[]): RawInstitutionalMessage[] {
    return [...batch].sort((a, b) => a.mailboxUid - b.mailboxUid);
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
