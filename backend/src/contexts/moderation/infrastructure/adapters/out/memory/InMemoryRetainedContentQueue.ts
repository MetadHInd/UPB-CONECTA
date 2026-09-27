import type { RetainedContentReview } from '../../../../domain/entities/RetainedContentReview.js';
import type { RetainedContentQueuePort } from '../../../../domain/ports/out/RetainedContentQueuePort.js';

export class InMemoryRetainedContentQueue implements RetainedContentQueuePort {
  private readonly reviews = new Map<string, RetainedContentReview>();

  async save(review: RetainedContentReview): Promise<void> {
    this.reviews.set(review.contentId, structuredClone(review));
  }

  async findByContentId(contentId: string): Promise<RetainedContentReview | null> {
    const found = this.reviews.get(contentId);
    return found ? structuredClone(found) : null;
  }

  async findPending(): Promise<readonly RetainedContentReview[]> {
    return [...this.reviews.values()]
      .filter((review) => review.status === 'pending')
      .sort((a, b) => a.resolutionDeadline.getTime() - b.resolutionDeadline.getTime())
      .map((review) => structuredClone(review));
  }

  async findOverdueNotEscalated(now: Date): Promise<readonly RetainedContentReview[]> {
    return (await this.findPending()).filter(
      (review) => review.resolutionDeadline.getTime() < now.getTime() && review.escalatedAt === null
    );
  }
}
