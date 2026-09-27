import type { Collection, Db } from 'mongodb';
import type { KnowledgeAuditEvent, KnowledgeAuditLogPort } from '../../../../domain/ports/out/KnowledgeAuditLogPort.js';

/** Append-only (`insertOne`), mismo patron que `MongoConvocatoriaAuditLog` (HU-50). */
export class MongoKnowledgeAuditLog implements KnowledgeAuditLogPort {
  static readonly COLLECTION = 'knowledge_audit';

  private readonly collection: Collection<KnowledgeAuditEvent>;

  constructor(db: Db, collectionName = MongoKnowledgeAuditLog.COLLECTION) {
    this.collection = db.collection<KnowledgeAuditEvent>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoKnowledgeAuditLog.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ entryId: 1, occurredAt: 1 }, { name: 'idx_entry_occurred' });
  }

  async record(event: KnowledgeAuditEvent): Promise<void> {
    await this.collection.insertOne({ ...event });
  }

  async findByEntryId(entryId: string): Promise<readonly KnowledgeAuditEvent[]> {
    const docs = await this.collection.find({ entryId }, { projection: { _id: 0 } }).sort({ occurredAt: 1, version: 1 }).toArray();
    return docs;
  }
}
