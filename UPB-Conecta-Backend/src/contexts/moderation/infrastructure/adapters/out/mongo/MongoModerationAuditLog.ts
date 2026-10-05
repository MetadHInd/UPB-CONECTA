import type { Collection, Db } from 'mongodb';
import type { ModerationAuditLogPort, ModerationDecisionRecord } from '../../../../domain/ports/out/ModerationAuditLogPort.js';

type ModerationDecisionDocument = ModerationDecisionRecord & { _id?: string };

/** Append-only (`insertOne`), mismo patron que `MongoForumAccessAuditLog` (HU-30) y `MongoClassificationCorrectionRepository` (HU-11). */
export class MongoModerationAuditLog implements ModerationAuditLogPort {
  static readonly COLLECTION = 'moderation_review_decisions';

  private readonly collection: Collection<ModerationDecisionDocument>;

  constructor(db: Db, collectionName = MongoModerationAuditLog.COLLECTION) {
    this.collection = db.collection<ModerationDecisionDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoModerationAuditLog.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ occurredAt: -1 }, { name: 'idx_occurred_at' });
  }

  async record(decision: ModerationDecisionRecord): Promise<void> {
    await this.collection.insertOne({ ...decision });
  }

  async findAll(): Promise<readonly ModerationDecisionRecord[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map(({ _id: _mongoId, ...decision }) => decision);
  }
}
