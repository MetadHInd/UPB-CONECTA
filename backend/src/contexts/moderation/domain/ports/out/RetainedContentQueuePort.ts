import type { RetainedContentReview } from '../../entities/RetainedContentReview.js';

export interface RetainedContentQueuePort {
  /** Inserta o reemplaza por `contentId`. */
  save(review: RetainedContentReview): Promise<void>;
  findByContentId(contentId: string): Promise<RetainedContentReview | null>;
  /** Pendientes, la de plazo mas proximo primero. */
  findPending(): Promise<readonly RetainedContentReview[]>;
  /** Pendientes con plazo vencido a `now` que aun no se han escalado. */
  findOverdueNotEscalated(now: Date): Promise<readonly RetainedContentReview[]>;
}
