import type { Collection, Db } from 'mongodb';
import type { ProcessedMessageRegistryPort } from '../../../../domain/ports/out/ProcessedMessageRegistryPort.js';
import type { MessageId } from '../../../../domain/value-objects/MessageId.js';

interface ProcessedMessageDocument {
  _id: string;
  mailboxUid: number;
  processedAt: Date;
}

/**
 * Registro de procesados sobre base de datos no relacional.
 *
 * El indice unico sobre `_id` es una defensa adicional frente a la escritura
 * concurrente, no la fuente de la garantia de idempotencia: esa regla vive en
 * `IdempotencyPolicy` y se verifica sin base de datos.
 */
export class MongoProcessedMessageRegistry implements ProcessedMessageRegistryPort {
  private readonly collection: Collection<ProcessedMessageDocument>;

  constructor(db: Db, collectionName = 'ingestion_processed_messages') {
    this.collection = db.collection<ProcessedMessageDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = 'ingestion_processed_messages'): Promise<void> {
    await db.collection(collectionName).createIndex({ mailboxUid: 1 }, { name: 'idx_mailbox_uid' });
  }

  async hasBeenProcessed(messageId: MessageId): Promise<boolean> {
    const found = await this.collection.findOne({ _id: messageId.toString() }, { projection: { _id: 1 } });
    return found !== null;
  }

  async markAsProcessed(messageId: MessageId, mailboxUid: number, processedAt: Date): Promise<void> {
    await this.collection.updateOne(
      { _id: messageId.toString() },
      { $setOnInsert: { mailboxUid, processedAt } },
      { upsert: true }
    );
  }
}
