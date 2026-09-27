import type { Collection, Db } from 'mongodb';
import type { ErasureRequest } from '../../../../domain/entities/ErasureRequest.js';
import type { ErasureRequestRepositoryPort } from '../../../../domain/ports/out/ErasureRequestRepositoryPort.js';

type ErasureRequestDocument = Omit<ErasureRequest, 'id'> & { _id: string };

function toRequest(doc: ErasureRequestDocument): ErasureRequest {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/** Solicitudes de supresion (HU-48). `_id` = id de la solicitud; upsert directo. */
export class MongoErasureRequestRepository implements ErasureRequestRepositoryPort {
  static readonly COLLECTION = 'datarights_erasure_requests';

  private readonly collection: Collection<ErasureRequestDocument>;

  constructor(db: Db, collectionName = MongoErasureRequestRepository.COLLECTION) {
    this.collection = db.collection<ErasureRequestDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoErasureRequestRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ status: 1, subject: 1 }, { name: 'idx_status_subject' });
  }

  async save(request: ErasureRequest): Promise<void> {
    const { id, ...rest } = request;
    await this.collection.replaceOne({ _id: id }, rest, { upsert: true });
  }

  async findById(id: string): Promise<ErasureRequest | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc === null ? null : toRequest(doc);
  }

  async findPendingBySubject(subject: string): Promise<ErasureRequest | null> {
    // `subject` llega como valor, nunca como operador: se compara por igualdad de cadena.
    const doc = await this.collection.findOne({ status: 'pending', subject: { $eq: subject } });
    return doc === null ? null : toRequest(doc);
  }

  async findPending(): Promise<readonly ErasureRequest[]> {
    return (await this.collection.find({ status: 'pending' }).toArray()).map(toRequest);
  }
}
