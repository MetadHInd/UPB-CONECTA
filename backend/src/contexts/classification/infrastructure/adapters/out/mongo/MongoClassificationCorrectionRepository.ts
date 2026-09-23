import type { Collection, Db } from 'mongodb';
import type {
  ClassificationCorrectionRecord,
  ClassificationCorrectionRepositoryPort
} from '../../../../domain/ports/out/ClassificationCorrectionRepositoryPort.js';

/**
 * Historial de correcciones manuales (HU-11). Append-only (`insertOne`),
 * igual que `MongoForumAccessAuditLog`: cada correccion es un hecho que se
 * conserva, nunca se sobrescribe.
 */
export class MongoClassificationCorrectionRepository implements ClassificationCorrectionRepositoryPort {
  static readonly COLLECTION = 'classification_corrections';

  private readonly collection: Collection<ClassificationCorrectionRecord>;

  constructor(db: Db, collectionName = MongoClassificationCorrectionRepository.COLLECTION) {
    this.collection = db.collection<ClassificationCorrectionRecord>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoClassificationCorrectionRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ messageId: 1, correctedAt: -1 }, { name: 'idx_message_corrected' });
  }

  async save(record: ClassificationCorrectionRecord): Promise<void> {
    await this.collection.insertOne({ ...record });
  }

  async findAll(): Promise<readonly ClassificationCorrectionRecord[]> {
    const docs = await this.collection.find({}).toArray();
    return docs.map(({ _id: _mongoId, ...record }) => record);
  }
}
