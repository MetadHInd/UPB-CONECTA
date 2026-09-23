import type { Collection, Db } from 'mongodb';
import type { RateLimitAuditLogPort, RateLimitExceededEvent } from '../../../../domain/ports/out/RateLimitAuditLogPort.js';

/** Append-only (`insertOne`), mismo patron que `MongoAuthorizationAuditLog` (HU-46) y `MongoForumAccessAuditLog` (HU-30). */
export class MongoRateLimitAuditLog implements RateLimitAuditLogPort {
  static readonly COLLECTION = 'hardening_rate_limit_audit';

  private readonly collection: Collection<RateLimitExceededEvent>;

  constructor(db: Db, collectionName = MongoRateLimitAuditLog.COLLECTION) {
    this.collection = db.collection<RateLimitExceededEvent>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoRateLimitAuditLog.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ subject: 1, occurredAt: -1 }, { name: 'idx_subject_occurred' });
  }

  async record(event: RateLimitExceededEvent): Promise<void> {
    await this.collection.insertOne({ ...event });
  }
}
