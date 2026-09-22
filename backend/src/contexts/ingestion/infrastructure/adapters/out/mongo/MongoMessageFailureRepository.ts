import type { Collection, Db } from 'mongodb';
import type { MessageFailureRepositoryPort } from '../../../../domain/ports/out/MessageFailureRepositoryPort.js';

interface MessageFailureDocument {
  _id: number;
  attempts: number;
  lastCause: string;
  firstFailedAt: Date;
  lastFailedAt: Date;
}

/**
 * Contador de fallos por uid del buzon (correccion del bug 2). `_id =
 * mailboxUid` y `$inc` con upsert: el incremento es atomico en el servidor,
 * sin leer y escribir por separado.
 */
export class MongoMessageFailureRepository implements MessageFailureRepositoryPort {
  static readonly COLLECTION = 'ingestion_message_failures';

  private readonly collection: Collection<MessageFailureDocument>;

  constructor(db: Db, collectionName = MongoMessageFailureRepository.COLLECTION) {
    this.collection = db.collection<MessageFailureDocument>(collectionName);
  }

  async recordFailure(mailboxUid: number, cause: string, at: Date): Promise<number> {
    const updated = await this.collection.findOneAndUpdate(
      { _id: mailboxUid },
      { $inc: { attempts: 1 }, $set: { lastCause: cause, lastFailedAt: at }, $setOnInsert: { firstFailedAt: at } },
      { upsert: true, returnDocument: 'after' }
    );
    return updated?.attempts ?? 1;
  }
}
