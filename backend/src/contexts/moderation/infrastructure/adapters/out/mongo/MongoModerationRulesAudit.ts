import type { Collection, Db } from 'mongodb';
import type { ModerationRulesAuditPort, ModerationRulesChange } from '../../../../domain/ports/out/ModerationRulesAuditPort.js';

type ModerationRulesChangeDocument = ModerationRulesChange & { _id?: unknown };

/** Append-only (`insertOne`), mismo patrón que `MongoModerationAuditLog` (HU-49). */
export class MongoModerationRulesAudit implements ModerationRulesAuditPort {
  static readonly COLLECTION = 'moderation_rules_audit';

  private readonly collection: Collection<ModerationRulesChangeDocument>;

  constructor(db: Db, collectionName = MongoModerationRulesAudit.COLLECTION) {
    this.collection = db.collection<ModerationRulesChangeDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoModerationRulesAudit.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ occurredAt: -1 }, { name: 'idx_occurred_at' });
  }

  async record(change: ModerationRulesChange): Promise<void> {
    await this.collection.insertOne({ ...change });
  }

  async findAll(): Promise<readonly ModerationRulesChange[]> {
    const docs = await this.collection.find({}).sort({ occurredAt: -1, _id: -1 }).toArray();
    return docs.map(({ _id: _mongoId, ...change }) => change as ModerationRulesChange);
  }
}
