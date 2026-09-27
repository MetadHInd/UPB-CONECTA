import type { Collection, Db } from 'mongodb';
import type { RetainedContentReview } from '../../../../domain/entities/RetainedContentReview.js';
import type { RetainedContentQueuePort } from '../../../../domain/ports/out/RetainedContentQueuePort.js';

type RetainedReviewDocument = Omit<RetainedContentReview, 'contentId'> & { _id: string };

function toDocument(review: RetainedContentReview): RetainedReviewDocument {
  const { contentId, ...rest } = review;
  return { _id: contentId, ...rest };
}

function toReview({ _id, ...rest }: RetainedReviewDocument): RetainedContentReview {
  return { contentId: _id, ...rest };
}

/** Un documento por contenido (`_id = contentId`): retener dos veces el mismo contenido no duplica la cola. */
export class MongoRetainedContentQueue implements RetainedContentQueuePort {
  static readonly COLLECTION = 'moderation_retained_content';

  private readonly collection: Collection<RetainedReviewDocument>;

  constructor(db: Db, collectionName = MongoRetainedContentQueue.COLLECTION) {
    this.collection = db.collection<RetainedReviewDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoRetainedContentQueue.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ status: 1, resolutionDeadline: 1 }, { name: 'idx_status_deadline' });
  }

  async save(review: RetainedContentReview): Promise<void> {
    const document = toDocument(review);
    await this.collection.replaceOne({ _id: document._id }, document, { upsert: true });
  }

  async findByContentId(contentId: string): Promise<RetainedContentReview | null> {
    const doc = await this.collection.findOne({ _id: contentId });
    return doc ? toReview(doc) : null;
  }

  async findPending(): Promise<readonly RetainedContentReview[]> {
    const docs = await this.collection.find({ status: 'pending' }).sort({ resolutionDeadline: 1 }).toArray();
    return docs.map(toReview);
  }

  async findOverdueNotEscalated(now: Date): Promise<readonly RetainedContentReview[]> {
    const docs = await this.collection
      .find({ status: 'pending', escalatedAt: null, resolutionDeadline: { $lt: now } })
      .sort({ resolutionDeadline: 1 })
      .toArray();
    return docs.map(toReview);
  }
}
