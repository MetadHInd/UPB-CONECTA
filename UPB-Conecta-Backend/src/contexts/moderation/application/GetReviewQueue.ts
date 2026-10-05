import type { QuarantineRepositoryPort } from '../../ingestion/domain/ports/out/QuarantineRepositoryPort.js';
import type { ConsolidatedMessageRegistryPort } from '../../ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { ClassificationResultRepositoryPort } from '../../classification/domain/ports/out/ClassificationResultRepositoryPort.js';
import { reviewQueueItemRefKey } from '../domain/value-objects/ReviewQueueItemRef.js';
import type { PendingReviewQueueItem, PrioritizedReviewQueueItem, QuarantineQueueItem, ReviewQueueItem } from '../domain/entities/ReviewQueueItem.js';
import type { ModerationAuditLogPort } from '../domain/ports/out/ModerationAuditLogPort.js';
import { prioritizeReviewQueue } from '../domain/services/ReviewQueueOrdering.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';

export interface GetReviewQueueDependencies {
  readonly quarantineRepo: QuarantineRepositoryPort;
  readonly classificationResultRepo: ClassificationResultRepositoryPort;
  readonly consolidatedRegistry: ConsolidatedMessageRegistryPort;
  readonly moderationAuditLog: ModerationAuditLogPort;
  readonly clock: ClockPort;
  readonly criticalAgeMs: number;
}

/**
 * HU-49 (RF-73, RF-06, RF-15, RNF-18): arma la cola unificada de cuarentena
 * (HU-04) y documentos en revision pendiente (HU-10), ordenada por fecha de
 * cierre mas proxima y marcando los que llevan mas de `criticalAgeMs` sin
 * resolverse (criterios 1, 2, 5, 6).
 *
 * Solo lectura: no cambia nada en `ingestion` ni en `classification`. Un
 * elemento con una decision ya registrada (`ModerationAuditLogPort`) se
 * excluye — ver la decision de diseño en el README (por que no se agrego un
 * campo de estado a `QuarantinedMessage`/`ClassificationResultRecord`).
 */
export class GetReviewQueue {
  constructor(private readonly deps: GetReviewQueueDependencies) {}

  async execute(): Promise<readonly PrioritizedReviewQueueItem[]> {
    const decisions = await this.deps.moderationAuditLog.findAll();
    const resolvedKeys = new Set(decisions.map((decision) => reviewQueueItemRefKey(decision.ref)));

    const quarantineItems = await this.buildQuarantineItems(resolvedKeys);
    const pendingReviewItems = await this.buildPendingReviewItems(resolvedKeys);

    const items: ReviewQueueItem[] = [...quarantineItems, ...pendingReviewItems];
    return prioritizeReviewQueue(items, this.deps.clock.now(), this.deps.criticalAgeMs);
  }

  private async buildQuarantineItems(resolvedKeys: ReadonlySet<string>): Promise<QuarantineQueueItem[]> {
    const quarantined = await this.deps.quarantineRepo.findAll();
    return quarantined
      .filter((message) => !resolvedKeys.has(`quarantine:${message.mailboxUid}`))
      .map((message) => ({
        ref: { kind: 'quarantine' as const, mailboxUid: message.mailboxUid },
        cause: message.cause,
        rawSource: message.rawSource,
        normalizedContent: null,
        proposedCategory: null,
        confidenceScore: null,
        dueDate: null,
        detectedAt: message.quarantinedAt
      }));
  }

  private async buildPendingReviewItems(resolvedKeys: ReadonlySet<string>): Promise<PendingReviewQueueItem[]> {
    const allResults = await this.deps.classificationResultRepo.findAll();
    const pending = allResults.filter(
      (record) => record.publicationStatus === 'pending-review' && !resolvedKeys.has(`pending-review:${record.messageId}`)
    );

    const items: PendingReviewQueueItem[] = [];
    for (const record of pending) {
      const consolidated = await this.deps.consolidatedRegistry.findByRepresentativeMessageId(record.messageId);
      // Sin grupo consolidado (dato inconsistente o borrado) no hay nada que mostrar de forma confiable: se omite.
      if (!consolidated) continue;

      items.push({
        ref: { kind: 'pending-review' as const, messageId: record.messageId },
        convocatoriaId: { sender: consolidated.sender, subject: consolidated.subject, firstSentAt: consolidated.firstSentAt },
        cause: record.reason ?? 'Puntaje de confianza bajo el umbral de revision.',
        rawSource: null,
        normalizedContent: consolidated.body,
        proposedCategory: record.proposedCategory,
        confidenceScore: record.confidenceScore,
        dueDate: consolidated.dueDate,
        detectedAt: record.persistedAt
      });
    }
    return items;
  }
}
