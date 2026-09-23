import type { Collection, Db } from 'mongodb';
import type { AuthorizationAuditEvent, AuthorizationAuditLogPort } from '../../../../domain/ports/out/AuthorizationAuditLogPort.js';

/** Append-only (`insertOne`), mismo patron que `MongoForumAccessAuditLog` (HU-30) y `MongoClassificationCorrectionRepository` (HU-11). */
export class MongoAuthorizationAuditLog implements AuthorizationAuditLogPort {
  static readonly COLLECTION = 'identity_authorization_audit';

  private readonly collection: Collection<AuthorizationAuditEvent>;

  constructor(db: Db, collectionName = MongoAuthorizationAuditLog.COLLECTION) {
    this.collection = db.collection<AuthorizationAuditEvent>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoAuthorizationAuditLog.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ subject: 1, occurredAt: -1 }, { name: 'idx_subject_occurred' });
  }

  async record(event: AuthorizationAuditEvent): Promise<void> {
    await this.collection.insertOne({ ...event });
  }
}
