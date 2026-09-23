import type { QuarantineRepositoryPort } from '../../ingestion/domain/ports/out/QuarantineRepositoryPort.js';
import type { ClassificationResultRepositoryPort } from '../../classification/domain/ports/out/ClassificationResultRepositoryPort.js';
import type { ReviewQueueItemRef } from '../domain/value-objects/ReviewQueueItemRef.js';
import { ModerationAction, type ModerationAuditLogPort } from '../domain/ports/out/ModerationAuditLogPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';

export interface DiscardReviewQueueItemCommand {
  readonly ref: ReviewQueueItemRef;
  readonly subject: string;
  /** Obligatorio (criterio 4: "la decision queda auditada con el motivo"). */
  readonly reason: string;
}

export class ReviewQueueItemNotFoundError extends Error {
  constructor() {
    super('El elemento de la cola de revision no existe.');
    this.name = 'ReviewQueueItemNotFoundError';
  }
}

export class DiscardReasonRequiredError extends Error {
  constructor() {
    super('Descartar un elemento de la cola exige un motivo.');
    this.name = 'DiscardReasonRequiredError';
  }
}

export interface DiscardReviewQueueItemDependencies {
  readonly quarantineRepo: QuarantineRepositoryPort;
  readonly classificationResultRepo: ClassificationResultRepositoryPort;
  readonly moderationAuditLog: ModerationAuditLogPort;
  readonly clock: ClockPort;
}

/**
 * HU-49, criterio 4: descartar un elemento de la cola — de cuarentena o de
 * revision pendiente, mismo caso de uso para ambos (a diferencia de
 * publicar, que solo aplica a revision pendiente). No modifica
 * `QuarantinedMessage` ni `ClassificationResultRecord`: solo registra la
 * decision (ver README, "por que no se agrego un campo de estado").
 */
export class DiscardReviewQueueItem {
  constructor(private readonly deps: DiscardReviewQueueItemDependencies) {}

  async execute(command: DiscardReviewQueueItemCommand): Promise<void> {
    if (!command.reason.trim()) {
      throw new DiscardReasonRequiredError();
    }

    await this.assertExists(command.ref);

    await this.deps.moderationAuditLog.record({
      subject: command.subject,
      action: ModerationAction.DISCARD,
      ref: command.ref,
      reason: command.reason,
      occurredAt: this.deps.clock.now()
    });
  }

  private async assertExists(ref: ReviewQueueItemRef): Promise<void> {
    if (ref.kind === 'quarantine') {
      const found = await this.deps.quarantineRepo.findByUid(ref.mailboxUid);
      if (!found) throw new ReviewQueueItemNotFoundError();
      return;
    }

    const found = await this.deps.classificationResultRepo.findByMessageId(ref.messageId);
    if (!found || found.publicationStatus !== 'pending-review') throw new ReviewQueueItemNotFoundError();
  }
}
