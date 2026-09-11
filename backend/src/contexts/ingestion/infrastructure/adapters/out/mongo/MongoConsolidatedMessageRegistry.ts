import type { Collection, Db } from 'mongodb';
import type {
  ConsolidatedMessageRecord,
  ConsolidatedMessageRegistryPort
} from '../../../../domain/ports/out/ConsolidatedMessageRegistryPort.js';

interface ConsolidatedMessageDocument {
  _id: string;
  sender: string;
  subject: string;
  body: string;
  firstSentAt: Date;
  lastSentAt: Date;
  resendCount: number;
}

function documentId(sender: string, subject: string, firstSentAt: Date): string {
  return `${sender}|${subject}|${firstSentAt.getTime()}`;
}

function toRecord(doc: ConsolidatedMessageDocument): ConsolidatedMessageRecord {
  return {
    sender: doc.sender,
    subject: doc.subject,
    body: doc.body,
    firstSentAt: doc.firstSentAt,
    lastSentAt: doc.lastSentAt,
    resendCount: doc.resendCount
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

  async save(record: ConsolidatedMessageRecord): Promise<void> {
    const _id = documentId(record.sender, record.subject, record.firstSentAt);
    await this.collection.updateOne(
      { _id },
      {
        $set: {
          sender: record.sender,
          subject: record.subject,
          body: record.body,
          firstSentAt: record.firstSentAt,
          lastSentAt: record.lastSentAt,
          resendCount: record.resendCount
        }
      },
      { upsert: true }
    );
  }
}
