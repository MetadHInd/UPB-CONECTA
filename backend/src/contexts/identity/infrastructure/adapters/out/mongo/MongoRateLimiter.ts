import type { Collection, Db } from 'mongodb';
import type { RateLimiterPort } from '../../../../domain/ports/out/RateLimiterPort.js';
import { readIdentityRateLimitConfig, type IdentityRateLimitConfig } from '../../../config/IdentityRateLimitConfig.js';

interface LoginFailureDocument {
  key: string;
  at: Date;
}

const GLOBAL_KEY = 'global';
/** El TTL solo limpia la coleccion; la ventana real se aplica al contar. */
const CLEANUP_AFTER_SECONDS = 24 * 60 * 60;

/**
 * Limitador de intentos fallidos (HU-43, RNF-16) con estado en MongoDB, para
 * que el limite valga entre todas las replicas de la API y sobreviva a un
 * reinicio. Misma semantica que `InMemoryRateLimiter`: cuenta por cuenta, por
 * origen y un cubo global; un login correcto limpia los tres.
 */
export class MongoRateLimiter implements RateLimiterPort {
  static readonly COLLECTION = 'identity_login_failures';

  private readonly collection: Collection<LoginFailureDocument>;

  constructor(
    db: Db,
    private readonly config: IdentityRateLimitConfig = readIdentityRateLimitConfig(),
    collectionName = MongoRateLimiter.COLLECTION
  ) {
    this.collection = db.collection<LoginFailureDocument>(collectionName);
  }

  static async ensureIndexes(db: Db, collectionName = MongoRateLimiter.COLLECTION): Promise<void> {
    const collection = db.collection(collectionName);
    await collection.createIndex({ at: 1 }, { expireAfterSeconds: CLEANUP_AFTER_SECONDS });
    await collection.createIndex({ key: 1, at: 1 });
  }

  async checkAllowed(accountId: string, origin: string): Promise<boolean> {
    const since = new Date(Date.now() - this.config.windowMs);
    const [byAccount, byOrigin, global] = await Promise.all([
      this.countSince(accountKey(accountId), since),
      this.countSince(originKey(origin), since),
      this.countSince(GLOBAL_KEY, since)
    ]);
    const globalLimit = Math.max(this.config.maxAttemptsPerAccount, this.config.maxAttemptsPerOrigin);
    return (
      byAccount < this.config.maxAttemptsPerAccount &&
      byOrigin < this.config.maxAttemptsPerOrigin &&
      global < globalLimit
    );
  }

  async recordFailure(accountId: string, origin: string): Promise<void> {
    const at = new Date();
    await this.collection.insertMany([
      { key: accountKey(accountId), at },
      { key: originKey(origin), at },
      { key: GLOBAL_KEY, at }
    ]);
  }

  async recordSuccess(accountId: string, origin: string): Promise<void> {
    await this.collection.deleteMany({ key: { $in: [accountKey(accountId), originKey(origin), GLOBAL_KEY] } });
  }

  private countSince(key: string, since: Date): Promise<number> {
    return this.collection.countDocuments({ key, at: { $gt: since } });
  }
}

function accountKey(accountId: string): string {
  return `account:${accountId.trim().toLowerCase()}`;
}

function originKey(origin: string): string {
  return `origin:${origin.trim().toLowerCase()}`;
}
