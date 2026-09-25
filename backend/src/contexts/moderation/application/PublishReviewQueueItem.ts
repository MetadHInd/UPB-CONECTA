import { CorrectClassification } from '../../classification/application/CorrectClassification.js';
import type { ClassificationResultRepositoryPort } from '../../classification/domain/ports/out/ClassificationResultRepositoryPort.js';
import type { ConsolidatedMessageRegistryPort } from '../../ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { ProgramTargetingRepositoryPort } from '../../targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';
import { allCommunityTargeting } from '../../targeting/domain/value-objects/ProgramTargeting.js';
import { ModerationAction, type ModerationAuditLogPort } from '../domain/ports/out/ModerationAuditLogPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';

export interface PublishReviewQueueItemCommand {
  readonly messageId: string;
  readonly subject: string;
}

export class DocumentNotPendingReviewError extends Error {
  constructor(messageId: string) {
    super(`El mensaje ${messageId} no esta en revision pendiente (o no tiene resultado de clasificacion).`);
    this.name = 'DocumentNotPendingReviewError';
  }
}

export interface PublishReviewQueueItemDependencies {
  readonly classificationResultRepo: ClassificationResultRepositoryPort;
  readonly consolidatedRegistry: ConsolidatedMessageRegistryPort;
  readonly programTargetingRepo: ProgramTargetingRepositoryPort;
  /** Instancia ya cableada de HU-11 — ver decision de diseño en el README. */
  readonly correctClassification: CorrectClassification;
  readonly moderationAuditLog: ModerationAuditLogPort;
  readonly clock: ClockPort;
}

/**
 * HU-49, criterio 3: publicar un documento en revision pendiente "tal como
 * esta" (sin corregir nada).
 *
 * Decision — reutiliza `CorrectClassification` (HU-11) en vez de duplicar el
 * caso de uso: "publicar sin cambios" es una correccion cuyo valor
 * corregido es identico al vigente (misma categoria, mismo targeting, misma
 * fecha de cierre). `CorrectClassification` ya cubre exactamente ese
 * efecto — pasa a `published`, programa notificaciones, y ademas registra
 * el caso etiquetado (HU-10): un administrador que aprueba la propuesta del
 * modelo sin tocarla *es* una confirmacion humana valida para el corpus de
 * precision, no solo un "aprobar" vacio. Duplicar la logica de publicacion
 * aqui reabriria exactamente los mismos gaps que HU-11 ya documento (fecha
 * en `NotificationSchedulingPort`, etc.) sin ganar nada.
 */
export class PublishReviewQueueItem {
  constructor(private readonly deps: PublishReviewQueueItemDependencies) {}

  async execute(command: PublishReviewQueueItemCommand): Promise<void> {
    const existing = await this.deps.classificationResultRepo.findByMessageId(command.messageId);
    if (!existing || existing.publicationStatus !== 'pending-review') {
      throw new DocumentNotPendingReviewError(command.messageId);
    }

    const consolidated = await this.deps.consolidatedRegistry.findByRepresentativeMessageId(command.messageId);
    if (!consolidated) {
      throw new DocumentNotPendingReviewError(command.messageId);
    }

    const targeting = await this.deps.programTargetingRepo.findByMessageId(command.messageId);

    await this.deps.correctClassification.execute({
      convocatoriaId: { sender: consolidated.sender, subject: consolidated.subject, firstSentAt: consolidated.firstSentAt },
      correctedCategory: existing.finalCategory,
      correctedTargeting: targeting?.targeting ?? allCommunityTargeting(),
      correctedDueDate: consolidated.dueDate
    });

    await this.deps.moderationAuditLog.record({
      subject: command.subject,
      action: ModerationAction.PUBLISH,
      ref: { kind: 'pending-review', messageId: command.messageId },
      reason: null,
      occurredAt: this.deps.clock.now()
    });
  }
}
