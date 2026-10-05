import type { Collection, Db } from 'mongodb';
import type { ConvocatoriaAuditEvent, ConvocatoriaAuditLogPort } from '../../../../domain/ports/out/ConvocatoriaAuditLogPort.js';

/** Append-only (`insertOne`), mismo patron que el resto de logs de auditoria del proyecto. */
export class MongoConvocatoriaAuditLog implements ConvocatoriaAuditLogPort {
  static readonly COLLECTION = 'ingestion_convocatoria_audit';

  private readonly collection: Collection<ConvocatoriaAuditEvent>;

  constructor(db: Db, collectionName = MongoConvocatoriaAuditLog.COLLECTION) {
    this.collection = db.collection<ConvocatoriaAuditEvent>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoConvocatoriaAuditLog.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ convocatoriaId: 1, occurredAt: -1 }, { name: 'idx_convocatoria_occurred' });
  }

  async record(event: ConvocatoriaAuditEvent): Promise<void> {
    await this.collection.insertOne({ ...event });
  }
}
