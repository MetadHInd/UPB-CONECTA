import { isReviewOverdue, type RetainedContentReview } from '../domain/entities/RetainedContentReview.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { RetainedContentQueuePort } from '../domain/ports/out/RetainedContentQueuePort.js';

export interface RetainedQueueEntry {
  readonly review: RetainedContentReview;
  /** Milisegundos hasta el plazo; negativo si ya vencio. */
  readonly remainingMs: number;
  readonly overdue: boolean;
}

/**
 * HU-32, criterio 5: cola de contenido retenido pendiente de resolucion
 * humana, por plazo mas proximo, con el tiempo restante y la marca de vencido.
 * Solo lectura. Es la vista del administrador (incluye fragmento y categoria);
 * nada de esto llega al autor.
 */
export class GetRetainedContentQueue {
  constructor(private readonly deps: { readonly queue: RetainedContentQueuePort; readonly clock: ClockPort }) {}

  async execute(): Promise<readonly RetainedQueueEntry[]> {
    const now = this.deps.clock.now();
    const pending = await this.deps.queue.findPending();
    return pending.map((review) => ({
      review,
      remainingMs: review.resolutionDeadline.getTime() - now.getTime(),
      overdue: isReviewOverdue(review, now)
    }));
  }
}
