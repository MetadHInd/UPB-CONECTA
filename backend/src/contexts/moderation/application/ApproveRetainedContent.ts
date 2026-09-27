import { approvedFeedback } from '../domain/services/AuthorFeedbackPolicy.js';
import type { AuthorFeedbackNotificationPort } from '../domain/ports/out/AuthorFeedbackNotificationPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ContentModerationLogPort } from '../domain/ports/out/ContentModerationLogPort.js';
import type { HeldContentPublisherPort } from '../domain/ports/out/HeldContentPublisherPort.js';
import type { RetainedContentQueuePort } from '../domain/ports/out/RetainedContentQueuePort.js';
import type { ModerationFeedbackConfig } from '../domain/value-objects/ModerationFeedbackConfig.js';
import { failure, type ResolveRetainedContentResult } from './ModerationFeedbackResults.js';

export interface ApproveRetainedContentCommand {
  readonly contentId: string;
  /** Revisor humano, sujeto de la sesion verificada (la autorizacion `content-admin` la hace quien invoque). */
  readonly reviewer: string;
}

export interface ApproveRetainedContentDependencies {
  readonly config: ModerationFeedbackConfig;
  readonly queue: RetainedContentQueuePort;
  readonly log: ContentModerationLogPort;
  readonly notifications: AuthorFeedbackNotificationPort;
  readonly publisher: HeldContentPublisherPort;
  readonly clock: ClockPort;
}

/**
 * HU-32, criterio 4: la revision humana aprueba un contenido retenido, se
 * publica y se informa al autor. Publica primero: si la publicacion falla, la
 * revision sigue pendiente (y visible en la cola) en vez de avisarle al autor
 * de una publicacion que no ocurrio.
 */
export class ApproveRetainedContent {
  constructor(private readonly deps: ApproveRetainedContentDependencies) {}

  async execute(command: ApproveRetainedContentCommand): Promise<ResolveRetainedContentResult> {
    const reviewer = command.reviewer.trim();
    if (reviewer === '') return failure('invalid-request', 'Aprobar un contenido retenido exige indicar el revisor.');

    const review = await this.deps.queue.findByContentId(command.contentId);
    if (!review) return failure('not-found', 'El contenido no esta en la cola de revision.');
    if (review.status !== 'pending') return failure('already-resolved', 'La revision de este contenido ya se resolvio.');

    await this.deps.publisher.publish(review.contentId, review.contentKind);

    const now = this.deps.clock.now();
    const resolved = { ...review, status: 'approved' as const, resolvedAt: now, resolvedBy: reviewer };
    await this.deps.queue.save(resolved);

    // Criterio 6: se conserva lo que motivo la retencion que se revirtio.
    await this.deps.log.record({
      contentId: review.contentId,
      contentKind: review.contentKind,
      authorEmail: review.authorEmail,
      verdict: 'publish',
      category: review.category,
      fragment: review.fragment,
      decidedBy: reviewer,
      source: 'human-review',
      internalDetail: null,
      occurredAt: now
    });

    const feedback = approvedFeedback(review.contentId);
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
