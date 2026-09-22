import type { Db, Collection } from 'mongodb';
import type { ClassificationRetryEntry, ClassificationRetryQueuePort } from '../../../../domain/ports/out/ClassificationRetryQueuePort.js';

export class MongoClassificationRetryQueue implements ClassificationRetryQueuePort {
  static readonly COLLECTION = 'classification_retry_queue';

  private readonly collection: Collection<ClassificationRetryEntry & { _id?: string }>;

  constructor(db: Db) {
    this.collection = db.collection<ClassificationRetryEntry & { _id?: string }>(MongoClassificationRetryQueue.COLLECTION);
  }

  /**
   * Upsert, no insert: si la ingesta se interrumpe despues de guardar aqui y
   * antes de marcar el mensaje como procesado, el mensaje se relee. Un
   * `insertOne` fallaria por clave duplicada en cada ciclo y detendria el lote
   * para siempre. Se conserva el `createdAt` del primer intento.
   */
  async save(entry: ClassificationRetryEntry): Promise<void> {
    const { createdAt, ...latest } = entry;
    await this.collection.updateOne(
      { _id: entry.messageId },
      { $set: latest, $setOnInsert: { createdAt } },
      { upsert: true }
    );
  }

  /** Busqueda por `_id`: no necesita indice propio. */
  async contains(messageId: string): Promise<boolean> {
    return (await this.collection.countDocuments({ _id: messageId }, { limit: 1 })) > 0;
  }
}
