import type { Db, Collection } from 'mongodb';
import type { ClassificationRetryEntry, ClassificationRetryQueuePort } from '../../../../domain/ports/out/ClassificationRetryQueuePort.js';

export class MongoClassificationRetryQueue implements ClassificationRetryQueuePort {
  static readonly COLLECTION = 'classification_retry_queue';

  private readonly collection: Collection<ClassificationRetryEntry & { _id?: string }>;

  constructor(db: Db) {
    this.collection = db.collection<ClassificationRetryEntry & { _id?: string }>(MongoClassificationRetryQueue.COLLECTION);
  }

  async save(entry: ClassificationRetryEntry): Promise<void> {
    await this.collection.insertOne({ ...entry, _id: entry.messageId });
  }
}
