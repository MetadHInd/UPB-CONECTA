import type { Collection, Db } from 'mongodb';
import type { ConsentDocumentType, ConsentRecord } from '../../../../domain/entities/ConsentRecord.js';
import type { ConsentRepositoryPort } from '../../../../domain/ports/out/ConsentRepositoryPort.js';

interface ConsentDocument {
  studentId: string;
  documentType: ConsentDocumentType;
  version: string;
  acceptedAt: Date;
}

function toRecord(doc: ConsentDocument): ConsentRecord {
  return { studentId: doc.studentId, documentType: doc.documentType, version: doc.version, acceptedAt: doc.acceptedAt };
}

/**
 * Registro de consentimiento (HU-44) sobre MongoDB. Append-only por diseno
 * (`insertOne`, nunca `updateOne`/upsert): la Ley 1581 exige poder demostrar
 * cada aceptacion tal como ocurrio, no solo la mas reciente.
 */
export class MongoConsentRepository implements ConsentRepositoryPort {
  private readonly collection: Collection<ConsentDocument>;

  constructor(db: Db, collectionName = 'consent_records') {
    this.collection = db.collection<ConsentDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = 'consent_records'): Promise<void> {
    await db
      .collection(collectionName)
      .createIndex({ studentId: 1, documentType: 1, acceptedAt: -1 }, { name: 'idx_student_document_acceptedAt' });
  }

  async record(consent: ConsentRecord): Promise<void> {
    await this.collection.insertOne({
      studentId: consent.studentId,
      documentType: consent.documentType,
      version: consent.version,
      acceptedAt: consent.acceptedAt
    });
  }

  async findLatest(studentId: string, documentType: ConsentDocumentType): Promise<ConsentRecord | null> {
    const found = await this.collection
      .find({ studentId, documentType })
      .sort({ acceptedAt: -1 })
      .limit(1)
      .toArray();
    return found[0] ? toRecord(found[0]) : null;
  }

  async findHistory(studentId: string, documentType: ConsentDocumentType): Promise<readonly ConsentRecord[]> {
    const found = await this.collection.find({ studentId, documentType }).sort({ acceptedAt: -1 }).toArray();
    return found.map(toRecord);
  }
}
