import { MongoServerError, type Collection, type Db } from 'mongodb';
import type { Infraction, InfractionOutcome, ModeratedContentSnapshot } from '../../../../domain/entities/Infraction.js';
import type { InfractionRepositoryPort } from '../../../../domain/ports/out/InfractionRepositoryPort.js';

interface InfractionDocument {
  _id: string;
  studentEmail: string;
  content: ModeratedContentSnapshot;
  outcome: InfractionOutcome;
  reason: string;
  detectedBy: string;
  occurredAt: Date;
}

const DUPLICATE_KEY = 11000;

function toInfraction(doc: InfractionDocument): Infraction {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/**
 * Historial de infracciones (HU-35). `_id` = `kind:id` del contenido, asi que
 * `insertOne` garantiza una sola infraccion por contenido aunque la
 * moderacion reintente.
 */
export class MongoInfractionRepository implements InfractionRepositoryPort {
  static readonly COLLECTION = 'forum_infractions';

  private readonly collection: Collection<InfractionDocument>;

  constructor(db: Db, collectionName = MongoInfractionRepository.COLLECTION) {
    this.collection = db.collection<InfractionDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoInfractionRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ studentEmail: 1, occurredAt: -1 }, { name: 'idx_student_occurred' });
  }

  async findById(id: string): Promise<Infraction | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toInfraction(doc) : null;
  }

  async create(infraction: Infraction): Promise<boolean> {
    const { id, ...rest } = infraction;
    try {
      await this.collection.insertOne({ _id: id, ...rest });
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  async update(infraction: Infraction): Promise<void> {
    const { id, ...rest } = infraction;
    await this.collection.replaceOne({ _id: id }, rest);
  }

  async findByStudent(email: string): Promise<readonly Infraction[]> {
    return (await this.collection.find({ studentEmail: email }).sort({ occurredAt: -1 }).toArray()).map(toInfraction);
  }
}
