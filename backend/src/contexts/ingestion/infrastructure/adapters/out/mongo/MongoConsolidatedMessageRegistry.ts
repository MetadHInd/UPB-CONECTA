import type { Collection, Db } from 'mongodb';
import type {
  ConsolidatedMessageRecord,
  ConsolidatedMessageRegistryPort
} from '../../../../domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { DueDate } from '../../../../domain/value-objects/DueDate.js';
import { convocatoriaIdToString, type ConvocatoriaId } from '../../../../domain/value-objects/ConvocatoriaId.js';

interface ConsolidatedMessageDocument {
  _id: string;
  sender: string;
  subject: string;
  body: string;
  representativeMessageId?: string | null;
  firstSentAt: Date;
  lastSentAt: Date;
  resendCount: number;
  dueDate: DueDate;
  applicationLink: string | null;
}

function toRecord(doc: ConsolidatedMessageDocument): ConsolidatedMessageRecord {
  return {
    sender: doc.sender,
    subject: doc.subject,
    body: doc.body,
    representativeMessageId: doc.representativeMessageId ?? null,
    firstSentAt: doc.firstSentAt,
    lastSentAt: doc.lastSentAt,
    resendCount: doc.resendCount,
    dueDate: doc.dueDate,
    applicationLink: doc.applicationLink
  };
}

/**
 * Registro de deduplicacion semantica (HU-03) sobre MongoDB.
 *
 * El indice por remitente+asunto acelera la busqueda del grupo vigente; el
 * filtro por ventana temporal se resuelve en el adaptador, no en el indice,
 * porque el limite depende de `lastSentAt` de cada grupo y de la fecha del
 * mensaje entrante, no de un valor fijo indexable.
 */
export class MongoConsolidatedMessageRegistry implements ConsolidatedMessageRegistryPort {
  private readonly collection: Collection<ConsolidatedMessageDocument>;

  constructor(db: Db, collectionName = 'ingestion_consolidated_messages') {
    this.collection = db.collection<ConsolidatedMessageDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = 'ingestion_consolidated_messages'): Promise<void> {
    await db
      .collection(collectionName)
      .createIndex({ sender: 1, subject: 1 }, { name: 'idx_sender_subject' });
    await db.collection(collectionName).createIndex({ representativeMessageId: 1 }, { name: 'idx_representative_message' });
    await db.collection(collectionName).createIndex({ lastSentAt: -1 }, { name: 'idx_last_sent_at' });
    await db.collection(collectionName).createIndex({ dueDate: 1 }, { name: 'idx_due_date' });
    // Compound index to accelerate lookups by representativeMessageId ordered by date
    await db
      .collection(collectionName)
      .createIndex({ representativeMessageId: 1, lastSentAt: -1 }, { name: 'idx_repmsg_lastsent' });
  }

  async findWithinWindow(
    sender: string,
    subject: string,
    referenceDate: Date,
    windowMs: number
  ): Promise<ConsolidatedMessageRecord | null> {
    const candidates = await this.collection.find({ sender, subject }).toArray();

    for (const candidate of candidates) {
      const elapsedMs = referenceDate.getTime() - candidate.lastSentAt.getTime();
      if (elapsedMs >= 0 && elapsedMs <= windowMs) return toRecord(candidate);
    }
    return null;
  }

  async findById(id: ConvocatoriaId): Promise<ConsolidatedMessageRecord | null> {
    const found = await this.collection.findOne({ _id: convocatoriaIdToString(id) });
    return found ? toRecord(found) : null;
  }

  async save(record: ConsolidatedMessageRecord): Promise<void> {
    const _id = convocatoriaIdToString(record);
    await this.collection.updateOne(
      { _id },
      {
        $set: {
          sender: record.sender,
          subject: record.subject,
          body: record.body,
          representativeMessageId: record.representativeMessageId ?? null,
          firstSentAt: record.firstSentAt,
          lastSentAt: record.lastSentAt,
          resendCount: record.resendCount,
          dueDate: record.dueDate,
          applicationLink: record.applicationLink
        }
      },
      { upsert: true }
    );
  }
}
