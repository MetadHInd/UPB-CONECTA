import { MongoServerError, type Collection, type Db } from 'mongodb';
import type { ConvocatoriaArchivePort, ConvocatoriaArchiveRecord } from '../../../../domain/ports/out/ConvocatoriaArchivePorts.js';

interface ConvocatoriaArchiveDocument {
  _id: string;
  dueAt: Date;
  archivedAt: Date;
}

const DUPLICATE_KEY = 11000;

/** Convocatorias archivadas (HU-48 criterio 6). `_id` = id de la convocatoria: archivar dos veces es un no-op. */
export class MongoConvocatoriaArchive implements ConvocatoriaArchivePort {
  static readonly COLLECTION = 'datarights_convocatoria_archive';

  private readonly collection: Collection<ConvocatoriaArchiveDocument>;

  constructor(db: Db, collectionName = MongoConvocatoriaArchive.COLLECTION) {
    this.collection = db.collection<ConvocatoriaArchiveDocument>(collectionName);
  }

  async archive(record: ConvocatoriaArchiveRecord): Promise<boolean> {
    try {
      await this.collection.insertOne({ _id: record.convocatoriaId, dueAt: record.dueAt, archivedAt: record.archivedAt });
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  async findAll(): Promise<readonly ConvocatoriaArchiveRecord[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map((doc) => ({ convocatoriaId: doc._id, dueAt: doc.dueAt, archivedAt: doc.archivedAt }));
  }
}
