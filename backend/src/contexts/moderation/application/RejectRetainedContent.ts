import { rejectedFeedback } from '../domain/services/AuthorFeedbackPolicy.js';
import type { AuthorFeedbackNotificationPort } from '../domain/ports/out/AuthorFeedbackNotificationPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ContentModerationLogPort } from '../domain/ports/out/ContentModerationLogPort.js';
import type { RetainedContentQueuePort } from '../domain/ports/out/RetainedContentQueuePort.js';
import { findNormForCategory, type ModerationFeedbackConfig } from '../domain/value-objects/ModerationFeedbackConfig.js';
import { failure, type ResolveRetainedContentResult } from './ModerationFeedbackResults.js';

export interface RejectRetainedContentCommand {
  readonly contentId: string;
  /** Revisor humano, sujeto de la sesion verificada. */
  readonly reviewer: string;
  /** Reclasificacion opcional de la infraccion; por defecto, la categoria con la que se retuvo. */
  readonly category?: string;
}

export interface RejectRetainedContentDependencies {
  readonly config: ModerationFeedbackConfig;
  readonly queue: RetainedContentQueuePort;
  readonly log: ContentModerationLogPort;
  readonly notifications: AuthorFeedbackNotificationPort;
  readonly clock: ClockPort;
}

/**
 * HU-32, criterios 2, 4 y 6: la revision humana confirma la infraccion de un
 * contenido retenido. No se publica; el autor recibe el motivo y la norma, y
 * el bloqueo humano queda registrado con el fragmento original y la categoria.
 */
export class RejectRetainedContent {
  constructor(private readonly deps: RejectRetainedContentDependencies) {}

  async execute(command: RejectRetainedContentCommand): Promise<ResolveRetainedContentResult> {
    const reviewer = command.reviewer.trim();
    if (reviewer === '') return failure('invalid-request', 'Rechazar un contenido retenido exige indicar el revisor.');

    const review = await this.deps.queue.findByContentId(command.contentId);
    if (!review) return failure('not-found', 'El contenido no esta en la cola de revision.');
    if (review.status !== 'pending') return failure('already-resolved', 'La revision de este contenido ya se resolvio.');

    const category = command.category?.trim() || review.category;
    if (findNormForCategory(this.deps.config, category) === null) {
      return failure('unknown-category', `La categoria "${category}" no tiene una norma de convivencia configurada.`);
    }

    const now = this.deps.clock.now();
    const resolved = { ...review, status: 'rejected' as const, resolvedAt: now, resolvedBy: reviewer };
    await this.deps.queue.save(resolved);

    await this.deps.log.record({
      contentId: review.contentId,
      contentKind: review.contentKind,
      authorEmail: review.authorEmail,
      verdict: 'block',
      category,
      fragment: review.fragment,
      decidedBy: reviewer,
      source: 'human-review',
      internalDetail: null,
      occurredAt: now
    });

    const feedback = rejectedFeedback(this.deps.config, review.contentId, category);
    await this.deps.notifications.notifyAuthor({
      authorEmail: review.authorEmail,
      contentId: review.contentId,
      contentKind: review.contentKind,
      feedback,
      createdAt: now
    });
    return { ok: true, review: resolved, feedback };
  }
}
