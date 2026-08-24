import type { Collection, Db } from 'mongodb';
import type { IngestionRunLogRepositoryPort } from '../../../../domain/ports/out/IngestionRunLogRepositoryPort.js';
import type { IngestionRunLog } from '../../../../domain/entities/IngestionRunLog.js';

interface RunLogDocument {
  startedAt: Date;
  finishedAt: Date | null;
  read: number;
  processed: number;
  duplicated: number;
  quarantined: number;
  incidents: { messageId: string | null; cause: string; occurredAt: Date }[];
}

/** RF-07: bitacora consultable por el administrador desde el panel de operacion. */
export class MongoIngestionRunLogRepository implements IngestionRunLogRepositoryPort {
  private readonly collection: Collection<RunLogDocument>;

  constructor(db: Db, collectionName = 'ingestion_run_logs') {
    this.collection = db.collection<RunLogDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = 'ingestion_run_logs'): Promise<void> {
    await db.collection(collectionName).createIndex({ startedAt: -1 }, { name: 'idx_started_at_desc' });
  }

  async save(log: IngestionRunLog): Promise<void> {
    await this.collection.insertOne({
      startedAt: log.startedAt,
      finishedAt: log.finishedAt,
      read: log.read,
      processed: log.processed,
      duplicated: log.duplicated,
      quarantined: log.quarantined,
      incidents: log.incidents.map((i) => ({ ...i }))
    });
  }
}
