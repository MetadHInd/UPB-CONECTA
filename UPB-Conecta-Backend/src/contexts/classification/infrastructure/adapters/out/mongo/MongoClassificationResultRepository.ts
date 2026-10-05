import type { Db, Collection } from 'mongodb';
import type { ClassificationResultRecord } from '../../../../domain/entities/ClassificationResult.js';
import type { ClassificationResultRepositoryPort } from '../../../../domain/ports/out/ClassificationResultRepositoryPort.js';

export class MongoClassificationResultRepository implements ClassificationResultRepositoryPort {
  static readonly COLLECTION = 'classification_results';

  /** HU-10: `findByMessageId` (gap 1, exclusion del feed) pasa a ser una consulta real, no solo el upsert de `save`. */
  static async ensureIndexes(db: Db, collectionName = MongoClassificationResultRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ messageId: 1 }, { name: 'idx_message_id', unique: true });
  }

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

  async findByMessageId(messageId: string): Promise<ClassificationResultRecord | null> {
    const found = await this.collection.findOne({ messageId });
    return found ? stripMongoId(found) : null;
  }

  async findAll(): Promise<readonly ClassificationResultRecord[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map(stripMongoId);
  }
}

function stripMongoId(doc: ClassificationResultRecord & { _id?: string }): ClassificationResultRecord {
  const { _id: _mongoId, ...record } = doc;
  return record;
}
