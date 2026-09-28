import type { Collection, Db } from 'mongodb';
import type {
  PracticeApplicationStatus,
  PracticeApplicationStatusChange,
  PracticeApplicationTracking
} from '../../../../domain/entities/PracticeApplicationTracking.js';
import type { PracticeApplicationTrackingRepositoryPort } from '../../../../domain/ports/out/PracticeApplicationTrackingRepositoryPort.js';

interface PracticeApplicationTrackingDocument {
  _id: string;
  studentId: string;
  offerId: string;
  offerTitle: string;
  company: string | null;
  status: PracticeApplicationStatus;
  history: PracticeApplicationStatusChange[];
  createdAt: Date;
  updatedAt: Date;
}

function documentId(studentId: string, offerId: string): string {
  return `${studentId}|${offerId}`;
}

function toTracking(doc: PracticeApplicationTrackingDocument): PracticeApplicationTracking {
  const { _id, ...rest } = doc;
  return rest;
}

/**
 * Seguimiento de postulaciones (HU-23). `_id = studentId|offerId`: un
 * seguimiento por estudiante y oferta, con upsert directo. El indice por
 * estudiante sostiene la vista de seguimiento; el de oferta y estado, la
 * consulta del planificador de recordatorios en cada ciclo.
 */
export class MongoPracticeApplicationTrackingRepository implements PracticeApplicationTrackingRepositoryPort {
  static readonly COLLECTION = 'practice_application_tracking';

  private readonly collection: Collection<PracticeApplicationTrackingDocument>;

  constructor(db: Db, collectionName = MongoPracticeApplicationTrackingRepository.COLLECTION) {
    this.collection = db.collection<PracticeApplicationTrackingDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoPracticeApplicationTrackingRepository.COLLECTION): Promise<void> {
    await db.collection(collectionName).createIndex({ studentId: 1, updatedAt: -1 }, { name: 'idx_student_updated' });
    await db.collection(collectionName).createIndex({ offerId: 1, status: 1 }, { name: 'idx_offer_status' });
  }

  async findByStudentAndOffer(studentId: string, offerId: string): Promise<PracticeApplicationTracking | null> {
    const doc = await this.collection.findOne({ _id: documentId(studentId, offerId) });
    return doc ? toTracking(doc) : null;
  }

  async findByStudent(studentId: string): Promise<readonly PracticeApplicationTracking[]> {
    const docs = await this.collection.find({ studentId }).toArray();
    return docs.map(toTracking);
  }

  async save(tracking: PracticeApplicationTracking): Promise<void> {
    await this.collection.replaceOne(
      { _id: documentId(tracking.studentId, tracking.offerId) },
      { ...tracking, history: [...tracking.history] },
      { upsert: true }
    );
  }

  async findTrackingStudents(
    offerIds: readonly string[],
    statuses: readonly PracticeApplicationStatus[]
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    if (offerIds.length === 0 || statuses.length === 0) return new Map();
    const docs = await this.collection
      .find({ offerId: { $in: [...offerIds] }, status: { $in: [...statuses] } }, { projection: { offerId: 1, studentId: 1 } })
      .toArray();
    const found = new Map<string, string[]>();
    for (const doc of docs) found.set(doc.offerId, [...(found.get(doc.offerId) ?? []), doc.studentId]);
    return found;
  }

  async deleteAllByStudent(studentId: string): Promise<number> {
    const result = await this.collection.deleteMany({ studentId });
    return result.deletedCount;
  }
}
