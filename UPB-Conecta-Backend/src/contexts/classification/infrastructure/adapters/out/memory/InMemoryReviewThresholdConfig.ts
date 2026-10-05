import type { ReviewThresholdConfigPort } from '../../../../domain/ports/out/ReviewThresholdConfigPort.js';
import { ReviewThreshold } from '../../../../domain/value-objects/ReviewThreshold.js';

export class InMemoryReviewThresholdConfig implements ReviewThresholdConfigPort {
  private current: ReviewThreshold;

  constructor(initial: ReviewThreshold = ReviewThreshold.default()) {
    this.current = initial;
  }

  async get(): Promise<ReviewThreshold> {
    return this.current;
  }

  async set(threshold: ReviewThreshold): Promise<void> {
    this.current = threshold;
  }
}
