import { IngestionRunLog } from '../domain/entities/IngestionRunLog.js';
import type { RawInstitutionalMessage } from '../domain/entities/RawInstitutionalMessage.js';
import type { IngestionCursor } from '../domain/value-objects/IngestionCursor.js';
import type { IdempotencyPolicy } from '../domain/services/IdempotencyPolicy.js';
import type { DeduplicationPolicy } from '../domain/services/DeduplicationPolicy.js';
import type { QuarantineIncidentPolicy } from '../domain/services/QuarantineIncidentPolicy.js';
import type { MailboxIngestionPort, UntranslatableMessage } from '../domain/ports/out/MailboxIngestionPort.js';
import type { ProcessedMessageRegistryPort } from '../domain/ports/out/ProcessedMessageRegistryPort.js';
import type { ConsolidatedMessageRegistryPort } from '../domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { QuarantineRepositoryPort } from '../domain/ports/out/QuarantineRepositoryPort.js';
import type { IngestionCursorRepositoryPort } from '../domain/ports/out/IngestionCursorRepositoryPort.js';
import type { IngestionRunLogRepositoryPort } from '../domain/ports/out/IngestionRunLogRepositoryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { IngestInstitutionalMessagesPort } from '../domain/ports/in/IngestInstitutionalMessagesPort.js';
import type { MessageNormalizerPort } from '../domain/ports/out/MessageNormalizerPort.js';

export interface IngestInstitutionalMessagesDependencies {
  readonly mailbox: MailboxIngestionPort;
  readonly registry: ProcessedMessageRegistryPort;
  readonly consolidatedRegistry: ConsolidatedMessageRegistryPort;
  readonly quarantine: QuarantineRepositoryPort;
  readonly cursors: IngestionCursorRepositoryPort;
  readonly logs: IngestionRunLogRepositoryPort;
  readonly idempotency: IdempotencyPolicy;
  readonly deduplication: DeduplicationPolicy;
  readonly deduplicationWindowMs: number;
  readonly quarantineIncidentPolicy: QuarantineIncidentPolicy;
  readonly normalizer: MessageNormalizerPort;
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
    const { mailbox, cursors, logs, clock, batchSize, quarantine, quarantineIncidentPolicy } = this.deps;
    const log = new IngestionRunLog(clock.now());

    // Suscribir el callback de mensajes no traducibles para que la ejecucion
    // en curso los derive a cuarentena (HU-04) sin violar la regla de capas:
    // la suscripcion es orquestacion y ocurre aqui, en la composicion/
    // ejecucion del caso de uso. El callback es sincrono, asi que solo
    // acumula; el guardado async ocurre despues de fetchUnprocessed().
    const untranslatable: UntranslatableMessage[] = [];
    if (mailbox.setOnUntranslatable) {
      mailbox.setOnUntranslatable((message) => {
        log.recordQuarantined();
        untranslatable.push(message);
      });
    }

    let cursor = await cursors.load();
    const batch = await mailbox.fetchUnprocessed(cursor, batchSize);

    for (const message of untranslatable) {
      await quarantine.save({
        mailboxUid: message.mailboxUid,
        cause: message.cause,
        rawSource: message.rawSource,
        quarantinedAt: clock.now()
      });
      // Nota: el UID en cuarentena no avanza el cursor aqui. Puede volver a
      // aparecer en ejecuciones posteriores hasta que exista un punto de
      // entrada para reprocesarlo (criterio 5, diferido — ver README).
    }

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
    if (quarantineIncidentPolicy.exceedsThreshold(log)) {
      log.markPriorityReview();
    }
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

    await this.consolidate(message);
    await registry.markAsProcessed(message.messageId, message.mailboxUid, clock.now());
    log.recordProcessed();
    return cursor.advanceTo(message.mailboxUid, clock.now());
  }

  /**
   * HU-03 (RF-05): un mensaje que ya paso el filtro de idempotencia por
   * Message-ID puede seguir siendo un reenvio semantico (mismo
   * remitente+asunto dentro de la ventana). Aqui se decide si genera un
   * documento nuevo, se consolida en el existente, o se actualiza su cuerpo.
   */
  private async consolidate(message: RawInstitutionalMessage): Promise<void> {
    const { normalizer, deduplication, deduplicationWindowMs, consolidatedRegistry } = this.deps;
    const normalized = normalizer.normalize(message);
    const decision = await deduplication.decide(normalized, deduplicationWindowMs);

    if (decision.kind === 'new') {
      await consolidatedRegistry.save({
        sender: normalized.sender,
        subject: normalized.subject,
        body: normalized.body,
        firstSentAt: normalized.sentAt,
        lastSentAt: normalized.sentAt,
        resendCount: 0
      });
      return;
    }

    const { existing } = decision;
    await consolidatedRegistry.save({
      sender: existing.sender,
      subject: existing.subject,
      body: decision.kind === 'update-body' ? normalized.body : existing.body,
      firstSentAt: existing.firstSentAt,
      lastSentAt: normalized.sentAt,
      resendCount: existing.resendCount + 1
    });
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
