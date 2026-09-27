import type { Collection, Db } from 'mongodb';
import type { RetainedContent } from '../../../../domain/entities/RetainedContent.js';
import type { HeldContentStorePort } from '../../../../domain/ports/out/HeldContentStorePort.js';

type RetainedContentDocument = Omit<RetainedContent, 'id'> & { _id: string };

export class MongoHeldContentStore implements HeldContentStorePort {
  static readonly COLLECTION = 'moderation_held_content';

  private readonly collection: Collection<RetainedContentDocument>;

  constructor(db: Db, collectionName = MongoHeldContentStore.COLLECTION) {
    this.collection = db.collection<RetainedContentDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoHeldContentStore.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ retainedAt: 1 }, { name: 'idx_retained_at' });
  }

  /** `$setOnInsert` por `_id`: un reintento del mismo envío no duplica ni pisa el elemento. */
  async enqueue(content: RetainedContent): Promise<void> {
    const { id, ...rest } = content;
    await this.collection.updateOne({ _id: id }, { $setOnInsert: rest }, { upsert: true });
  }

  async findPending(): Promise<readonly RetainedContent[]> {
    const docs = await this.collection.find({}).sort({ retainedAt: 1 }).toArray();
    return docs.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  }

  async findById(id: string): Promise<RetainedContent | null> {
    const doc = await this.collection.findOne({ _id: id });
    if (doc === null) return null;
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
  }

  async remove(id: string): Promise<void> {
    await this.collection.deleteOne({ _id: id });
  }
}
