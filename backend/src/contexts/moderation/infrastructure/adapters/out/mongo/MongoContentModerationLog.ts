import type { Collection, Db } from 'mongodb';
import type { ContentModerationLogEntry, ContentModerationLogPort } from '../../../../domain/ports/out/ContentModerationLogPort.js';

type ContentModerationLogDocument = ContentModerationLogEntry & { _id?: unknown };

/** Append-only (`insertOne`), mismo patron que `MongoModerationAuditLog` (HU-49). */
export class MongoContentModerationLog implements ContentModerationLogPort {
  static readonly COLLECTION = 'moderation_content_decisions';

  private readonly collection: Collection<ContentModerationLogDocument>;

  constructor(db: Db, collectionName = MongoContentModerationLog.COLLECTION) {
    this.collection = db.collection<ContentModerationLogDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoContentModerationLog.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ contentId: 1, occurredAt: 1 }, { name: 'idx_content_occurred' });
  }

  async record(entry: ContentModerationLogEntry): Promise<void> {
    await this.collection.insertOne({ ...entry });
  }

  async findByContentId(contentId: string): Promise<readonly ContentModerationLogEntry[]> {
    const docs = await this.collection.find({ contentId }).sort({ occurredAt: 1 }).toArray();
    return docs.map(({ _id: _mongoId, ...entry }) => entry);
  }
}
