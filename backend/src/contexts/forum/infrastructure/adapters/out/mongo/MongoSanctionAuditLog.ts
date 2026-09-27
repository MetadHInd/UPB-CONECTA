import type { Collection, Db } from 'mongodb';
import type { SanctionAuditEvent, SanctionAuditPort } from '../../../../domain/ports/out/SanctionAuditPort.js';

/**
 * Auditoria de sanciones (HU-35 criterios 6 y 7). Append-only (`insertOne`):
 * una revocacion o un cambio de umbrales es un hecho, nunca se sobrescribe.
 */
export class MongoSanctionAuditLog implements SanctionAuditPort {
  static readonly COLLECTION = 'forum_sanction_audit';

  private readonly collection: Collection<SanctionAuditEvent>;

  constructor(db: Db, collectionName = MongoSanctionAuditLog.COLLECTION) {
    this.collection = db.collection<SanctionAuditEvent>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoSanctionAuditLog.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ studentEmail: 1, occurredAt: -1 }, { name: 'idx_student_occurred' });
    await db.collection(collectionName).createIndex({ performedBy: 1, occurredAt: -1 }, { name: 'idx_performer_occurred' });
  }

  async record(event: SanctionAuditEvent): Promise<void> {
    await this.collection.insertOne({ ...event });
  }
}
