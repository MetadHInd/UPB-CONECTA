import type { Collection, Db } from 'mongodb';
import type { QuarantinedMessage } from '../../../../domain/entities/QuarantinedMessage.js';
import type { QuarantineRepositoryPort } from '../../../../domain/ports/out/QuarantineRepositoryPort.js';

interface QuarantinedMessageDocument {
  _id: number;
  cause: string;
  rawSource: string;
  quarantinedAt: Date;
}

function toRecord(doc: QuarantinedMessageDocument): QuarantinedMessage {
  return { mailboxUid: doc._id, cause: doc.cause, rawSource: doc.rawSource, quarantinedAt: doc.quarantinedAt };
}

/**
 * Registro de cuarentena (HU-04) sobre MongoDB. `_id = mailboxUid`: un mismo
 * uid nunca deberia quedar en cuarentena dos veces en ejecuciones distintas
 * (el cursor no avanza sobre el), asi que un upsert por `_id` es suficiente y
 * conserva siempre el ultimo diagnostico.
 */
export class MongoQuarantineRepository implements QuarantineRepositoryPort {
  private readonly collection: Collection<QuarantinedMessageDocument>;

  constructor(db: Db, collectionName = 'ingestion_quarantined_messages') {
    this.collection = db.collection<QuarantinedMessageDocument>(collectionName);
  }

  async save(message: QuarantinedMessage): Promise<void> {
    await this.collection.updateOne(
      { _id: message.mailboxUid },
      { $set: { cause: message.cause, rawSource: message.rawSource, quarantinedAt: message.quarantinedAt } },
      { upsert: true }
    );
  }

  async findByUid(mailboxUid: number): Promise<QuarantinedMessage | null> {
    const found = await this.collection.findOne({ _id: mailboxUid });
    return found ? toRecord(found) : null;
  }
}
