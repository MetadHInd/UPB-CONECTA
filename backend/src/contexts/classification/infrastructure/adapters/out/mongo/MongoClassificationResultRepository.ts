import type { Db, Collection } from 'mongodb';
import type { ClassificationResultRecord } from '../../../../domain/entities/ClassificationResult.js';
import type { ClassificationResultRepositoryPort } from '../../../../domain/ports/out/ClassificationResultRepositoryPort.js';

export class MongoClassificationResultRepository implements ClassificationResultRepositoryPort {
  static readonly COLLECTION = 'classification_results';

  private readonly collection: Collection<ClassificationResultRecord & { _id?: string }>;

  constructor(db: Db) {
    this.collection = db.collection<ClassificationResultRecord & { _id?: string }>(MongoClassificationResultRepository.COLLECTION);
  }

  async save(record: ClassificationResultRecord): Promise<void> {
    await this.collection.updateOne(
      { messageId: record.messageId },
      { $set: record },
      { upsert: true }
    );
  }
}
