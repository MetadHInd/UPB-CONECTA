import type { Collection, Db } from 'mongodb';
import type { ReviewThresholdConfigPort } from '../../../../domain/ports/out/ReviewThresholdConfigPort.js';
import { ReviewThreshold } from '../../../../domain/value-objects/ReviewThreshold.js';

interface ReviewThresholdDocument {
  readonly _id: string;
  readonly value: number;
}

const CONFIG_DOCUMENT_ID = 'review-threshold';

export class MongoReviewThresholdConfig implements ReviewThresholdConfigPort {
  static readonly COLLECTION = 'classification_review_threshold_config';

  private readonly collection: Collection<ReviewThresholdDocument>;

  constructor(db: Db, collectionName = MongoReviewThresholdConfig.COLLECTION) {
    this.collection = db.collection<ReviewThresholdDocument>(collectionName);
  }

  async get(): Promise<ReviewThreshold> {
    const doc = await this.collection.findOne({ _id: CONFIG_DOCUMENT_ID });
    return doc ? ReviewThreshold.of(doc.value) : ReviewThreshold.default();
  }

  async set(threshold: ReviewThreshold): Promise<void> {
    await this.collection.updateOne(
      { _id: CONFIG_DOCUMENT_ID },
      { $set: { _id: CONFIG_DOCUMENT_ID, value: threshold.value } },
      { upsert: true }
    );
  }
}
