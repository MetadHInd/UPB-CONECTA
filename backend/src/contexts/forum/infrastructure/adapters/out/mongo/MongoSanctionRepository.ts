import type { Collection, Db } from 'mongodb';
import type { SanctionLevel, SanctionRecord, SanctionRevocation } from '../../../../domain/entities/Sanction.js';
import type { SanctionRepositoryPort } from '../../../../domain/ports/out/SanctionRepositoryPort.js';

interface SanctionDocument {
  _id: string;
  studentEmail: string;
  level: SanctionLevel;
  reason: string;
  startsAt: Date;
  endsAt: Date;
  revokedAt: Date | null;
  infractionCount: number;
  triggeredByInfractionId: string;
  imposedAt: Date;
  revocation: SanctionRevocation | null;
}

function toSanction(doc: SanctionDocument): SanctionRecord {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/**
 * Sanciones del foro (HU-35). Es tambien el `SanctionStatusPort` que consulta
 * `CreatePost` (HU-30): devuelve todas las del estudiante y el dominio decide
 * cuales estan vigentes, asi que al vencer el plazo nadie tiene que tocar el
 * documento (criterio 4).
 */
export class MongoSanctionRepository implements SanctionRepositoryPort {
  static readonly COLLECTION = 'forum_sanctions';

  private readonly collection: Collection<SanctionDocument>;

  constructor(db: Db, collectionName = MongoSanctionRepository.COLLECTION) {
    this.collection = db.collection<SanctionDocument>(collectionName);
  }

  /**
   * `idx_student_imposed` sirve a la consulta de cada publicacion y al historial.
   * A igual fecha desempata el conteo: la del escalon mas alto va primero.
   */
  static async ensureIndexes(db: Db, collectionName = MongoSanctionRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ studentEmail: 1, imposedAt: -1 }, { name: 'idx_student_imposed' });
  }

  async save(sanction: SanctionRecord): Promise<void> {
    const { id, ...rest } = sanction;
    await this.collection.insertOne({ _id: id, ...rest, revokedAt: rest.revokedAt ?? null });
  }

  async findById(id: string): Promise<SanctionRecord | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toSanction(doc) : null;
  }

  async findSanctions(email: string): Promise<readonly SanctionRecord[]> {
    return (await this.collection.find({ studentEmail: email }).sort({ imposedAt: -1, infractionCount: -1 }).toArray()).map(toSanction);
  }

  async update(sanction: SanctionRecord): Promise<void> {
    const { id, ...rest } = sanction;
    await this.collection.replaceOne({ _id: id }, { ...rest, revokedAt: rest.revokedAt ?? null });
  }
}
