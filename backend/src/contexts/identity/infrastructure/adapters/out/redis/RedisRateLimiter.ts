import { randomUUID } from 'node:crypto';
import type { RateLimiterPort } from '../../../../domain/ports/out/RateLimiterPort.js';
import { readIdentityRateLimitConfig, type IdentityRateLimitConfig } from '../../../config/IdentityRateLimitConfig.js';
import { withRedisTimeout, type RedisClient } from '../../../../../../infrastructure/shared/redis.js';

const GLOBAL_KEY = 'identity:rl:global';

/**
 * Limitador de intentos fallidos de login (HU-43, RNF-16) sobre Redis, con la
 * misma semantica de ventana deslizante que `MongoRateLimiter` y
 * `InMemoryRateLimiter`: cada fallo es un miembro de un conjunto ordenado por
 * instante, se cuentan solo los de la ultima ventana, y un login correcto
 * limpia los tres contadores (cuenta, origen y global).
 *
 * Frente a MongoDB evita una escritura de documento por intento y deja que
 * Redis expire las claves solo. Lanza si Redis falla; `FallbackRateLimiter`
 * decide el respaldo.
 */
export class RedisRateLimiter implements RateLimiterPort {
  constructor(
    private readonly redis: RedisClient,
    private readonly config: IdentityRateLimitConfig = readIdentityRateLimitConfig()
  ) {}

  async checkAllowed(accountId: string, origin: string): Promise<boolean> {
    const since = Date.now() - this.config.windowMs;
    const keys = [accountKey(accountId), originKey(origin), GLOBAL_KEY];
    const multi = this.redis.multi();
    for (const key of keys) {
      multi.zRemRangeByScore(key, 0, since);
      multi.zCard(key);
    }
    const reply = await withRedisTimeout(multi.exec());
    const counts = [Number(reply[1]), Number(reply[3]), Number(reply[5])] as const;
    const globalLimit = Math.max(this.config.maxAttemptsPerAccount, this.config.maxAttemptsPerOrigin);
    return (
      counts[0] < this.config.maxAttemptsPerAccount &&
      counts[1] < this.config.maxAttemptsPerOrigin &&
      counts[2] < globalLimit
    );
  }

  async recordFailure(accountId: string, origin: string): Promise<void> {
    const now = Date.now();
    const member = `${now}-${randomUUID()}`;
    const multi = this.redis.multi();
    for (const key of [accountKey(accountId), originKey(origin), GLOBAL_KEY]) {
      multi.zAdd(key, { score: now, value: member });
      multi.pExpire(key, this.config.windowMs);
    }
    await withRedisTimeout(multi.exec());
  }

  async recordSuccess(accountId: string, origin: string): Promise<void> {
    await withRedisTimeout(this.redis.del([accountKey(accountId), originKey(origin), GLOBAL_KEY]));
  }
}

function accountKey(accountId: string): string {
  return `identity:rl:account:${accountId.trim().toLowerCase()}`;
}

function originKey(origin: string): string {
  return `identity:rl:origin:${origin.trim().toLowerCase()}`;
}
