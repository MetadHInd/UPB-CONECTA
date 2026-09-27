import type { Collection, Db } from 'mongodb';
import type { RectificationEntry } from '../../../../domain/entities/RectificationEntry.js';
import type { RectificationLogPort } from '../../../../domain/ports/out/RectificationLogPort.js';

type RectificationDocument = RectificationEntry & { _id?: unknown };

/** Historial append-only de correcciones (HU-48 criterio 2): solo `insertOne`, salvo la supresion del titular. */
export class MongoRectificationLog implements RectificationLogPort {
  static readonly COLLECTION = 'datarights_rectifications';

  private readonly collection: Collection<RectificationDocument>;

  constructor(db: Db, collectionName = MongoRectificationLog.COLLECTION) {
    this.collection = db.collection<RectificationDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoRectificationLog.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ subject: 1, rectifiedAt: -1 }, { name: 'idx_subject_rectified' });
  }

  async record(entry: RectificationEntry): Promise<void> {
    await this.collection.insertOne({ ...entry });
  }

  async findBySubject(subject: string): Promise<readonly RectificationEntry[]> {
    const docs = await this.collection.find({ subject: { $eq: subject } }).sort({ rectifiedAt: -1 }).toArray();
    return docs.map(({ _id: _mongoId, ...entry }) => entry);
  }

  async deleteBySubject(subject: string): Promise<number> {
    const result = await this.collection.deleteMany({ subject: { $eq: subject } });
    return result.deletedCount;
  }
}
