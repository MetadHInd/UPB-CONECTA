import { randomUUID } from 'node:crypto';
import type { Collection, Db } from 'mongodb';

interface LeaseDocument {
  _id: string;
  owner: string;
  acquiredAt: Date;
  expiresAt: Date;
}

/**
 * Arrendamiento (lease) con expiracion sobre MongoDB: garantiza que, entre
 * varias replicas, solo una ejecute un trabajo periodico a la vez (ingesta del
 * buzon, avisos de vencimiento). Si la replica que lo tiene cae, el
 * arrendamiento vence solo y otra lo toma: no hay un lider fijo que pueda
 * quedar colgado (RNF-12).
 *
 * La adquisicion es atomica: un `findOneAndUpdate` con upsert cuyo filtro solo
 * coincide si el arrendamiento esta libre, vencido o ya es nuestro; si otra
 * replica lo tiene vigente, el upsert choca con `_id` y MongoDB responde
 * clave duplicada (11000), que aqui significa "ocupado".
 */
export class MongoLease {
  static readonly COLLECTION = 'scheduler_leases';

  private readonly collection: Collection<LeaseDocument>;

  constructor(
    db: Db,
    readonly ownerId: string = randomUUID(),
    collectionName = MongoLease.COLLECTION
  ) {
    this.collection = db.collection<LeaseDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoLease.COLLECTION): Promise<void> {
    // Solo limpia documentos vencidos; la logica de vigencia no depende de el.
    await db.collection(collectionName).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 });
  }

  /** `true` si esta instancia queda como titular durante `ttlMs`. Renueva si ya lo era. */
  async tryAcquire(name: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    try {
      const held = await this.collection.findOneAndUpdate(
        { _id: name, $or: [{ expiresAt: { $lte: now } }, { owner: this.ownerId }] },
        { $set: { owner: this.ownerId, acquiredAt: now, expiresAt: new Date(now.getTime() + ttlMs) } },
        { upsert: true, returnDocument: 'after' }
      );
      return held?.owner === this.ownerId;
    } catch (error) {
      if (isDuplicateKey(error)) return false;
      throw error;
    }
  }

  /** Libera solo si esta instancia es la titular; nunca quita el arrendamiento de otra. */
  async release(name: string): Promise<void> {
    await this.collection.deleteOne({ _id: name, owner: this.ownerId });
  }
}

/**
 * Envuelve un caso de uso periodico para que cada ciclo corra solo si esta
 * instancia obtiene el arrendamiento; si otra replica lo tiene, el ciclo se
 * omite sin error. El arrendamiento se libera al terminar, y `ttlMs` cubre el
 * caso de que el proceso muera a mitad del ciclo.
 */
export function withLease<T>(
  lease: MongoLease,
  name: string,
  ttlMs: number,
  useCase: { execute(): Promise<T> },
  onSkipped: () => void = () => {}
): { execute(): Promise<T | undefined> } {
  return {
    async execute() {
      if (!(await lease.tryAcquire(name, ttlMs))) {
        onSkipped();
        return undefined;
      }
      try {
        return await useCase.execute();
      } finally {
        await lease.release(name);
      }
    }
  };
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}
