import type { RefreshTokenRecord, RefreshTokenRevocationReason } from '../../../../domain/entities/RefreshTokenRecord.js';
import type { RefreshTokenRepositoryPort } from '../../../../domain/ports/out/RefreshTokenRepositoryPort.js';
import { withRedisTimeout, type RedisClient } from '../../../../../../infrastructure/shared/redis.js';

export interface RevocationCacheOptions {
  /** Cuanto se recuerda que una cadena esta revocada. Pasado ese tiempo se consulta MongoDB, que sigue dando el mismo resultado. */
  readonly revokedTtlSeconds?: number;
  /** Cuanto se recuerda que una cadena NO esta revocada. Acota el retraso si alguien revoca sin pasar por este decorador. */
  readonly liveTtlSeconds?: number;
  readonly log?: (message: string) => void;
}

/**
 * Cache de revocacion de sesiones (RNF-07). Cada peticion autenticada pregunta
 * `isChainRevoked`, y hasta ahora eso era una consulta a MongoDB por peticion.
 *
 * MongoDB sigue siendo la fuente de verdad: este decorador solo recuerda
 * respuestas, y todo lo demas lo delega tal cual.
 *
 * - Revocar: primero se borra la marca "viva", luego se revoca en MongoDB y por
 *   ultimo se guarda la marca "revocada" en Redis. Como la marca "revocada" se
 *   mira antes que la "viva", el corte de sesion es inmediato para todas las
 *   replicas (comparten Redis), sin esperar a que expire nada.
 * - Consultar: marca "revocada" -> true; marca "viva" -> false; sin marcas ->
 *   MongoDB, y se recuerda la respuesta.
 * - Si Redis falla o tarda, se consulta MongoDB: nunca se devuelve "viva" por
 *   un error de Redis, asi que una caida de la cache no puede dejar pasar una
 *   sesion revocada.
 *
 * Limite conocido: si Redis estaba caido justo al revocar y vuelve con una
 * marca "viva" anterior, esa marca puede darse por buena hasta `liveTtlSeconds`
 * (30 s por defecto, mucho menos que los 15 min del token de acceso).
 */
export class RedisCachedRefreshTokenRepository implements RefreshTokenRepositoryPort {
  private readonly revokedTtl: number;
  private readonly liveTtl: number;
  private readonly log: (message: string) => void;

  constructor(
    private readonly inner: RefreshTokenRepositoryPort,
    private readonly redis: RedisClient,
    options: RevocationCacheOptions = {}
  ) {
    this.revokedTtl = options.revokedTtlSeconds ?? 3600;
    this.liveTtl = options.liveTtlSeconds ?? 30;
    this.log = options.log ?? console.log;
  }

  register(record: RefreshTokenRecord): Promise<void> {
    return this.inner.register(record);
  }

  findByTokenId(tokenId: string): Promise<RefreshTokenRecord | null> {
    return this.inner.findByTokenId(tokenId);
  }

  markUsed(tokenId: string, at: Date): Promise<boolean> {
    return this.inner.markUsed(tokenId, at);
  }

  findLiveChainIdsBySubject(subject: string): Promise<readonly string[]> {
    return this.inner.findLiveChainIdsBySubject(subject);
  }

  async revokeChain(chainId: string, reason: RefreshTokenRevocationReason, at: Date): Promise<void> {
    await this.bestEffort(() => this.redis.del(liveKey(chainId)));
    await this.inner.revokeChain(chainId, reason, at);
    await this.bestEffort(() => this.redis.set(revokedKey(chainId), '1', { expiration: { type: 'EX', value: this.revokedTtl } }));
  }

  async isChainRevoked(chainId: string): Promise<boolean> {
    try {
      const [revoked, live] = await withRedisTimeout(this.redis.mGet([revokedKey(chainId), liveKey(chainId)]));
      if (revoked !== null) return true;
      if (live !== null) return false;
    } catch (error) {
      this.warn(error);
    }

    const result = await this.inner.isChainRevoked(chainId);
    await this.bestEffort(() =>
      result
        ? this.redis.set(revokedKey(chainId), '1', { expiration: { type: 'EX', value: this.revokedTtl } })
        : this.redis.set(liveKey(chainId), '1', { expiration: { type: 'EX', value: this.liveTtl } })
    );
    return result;
  }

  private async bestEffort(operation: () => Promise<unknown>): Promise<void> {
    try {
      await withRedisTimeout(operation());
    } catch (error) {
      this.warn(error);
    }
  }

  private lastWarning = 0;
  private warn(error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarning < 30_000) return;
    this.lastWarning = now;
    this.log(`[session-cache] Redis fallo, se consulta MongoDB: ${(error as Error).message}`);
  }
}

function revokedKey(chainId: string): string {
  return `identity:chain:revoked:${chainId}`;
}

function liveKey(chainId: string): string {
  return `identity:chain:live:${chainId}`;
}
