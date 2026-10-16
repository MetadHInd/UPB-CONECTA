import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RefreshTokenRecord } from '../../../src/contexts/identity/domain/entities/RefreshTokenRecord.js';
import type { RefreshTokenRepositoryPort } from '../../../src/contexts/identity/domain/ports/out/RefreshTokenRepositoryPort.js';
import { InMemoryRefreshTokenRepository } from '../../../src/contexts/identity/infrastructure/adapters/out/memory/InMemoryRefreshTokenRepository.js';
import { RedisCachedRefreshTokenRepository } from '../../../src/contexts/identity/infrastructure/adapters/out/redis/RedisCachedRefreshTokenRepository.js';
import type { RedisClient } from '../../../src/infrastructure/shared/redis.js';
import { connectDeadRedis, connectTestRedis, SESSION_CACHE_DB } from './redisTestClient.js';

const T0 = new Date('2026-09-22T12:00:00Z');

function record(tokenId: string, chainId: string): RefreshTokenRecord {
  return {
    tokenId,
    chainId,
    subject: 'estudiante@upb.edu.co',
    status: 'active',
    issuedAt: T0,
    expiresAt: new Date(T0.getTime() + 3_600_000),
    usedAt: null,
    revokedAt: null,
    revokedReason: null
  };
}

/** Cuenta cuantas veces se consulta la fuente de verdad. */
class CountingRepository implements RefreshTokenRepositoryPort {
  isChainRevokedCalls = 0;
  readonly inner = new InMemoryRefreshTokenRepository();
  register = (r: RefreshTokenRecord) => this.inner.register(r);
  findByTokenId = (id: string) => this.inner.findByTokenId(id);
  markUsed = (id: string, at: Date) => this.inner.markUsed(id, at);
  revokeChain = (chain: string, reason: Parameters<RefreshTokenRepositoryPort['revokeChain']>[1], at: Date) => this.inner.revokeChain(chain, reason, at);
  findLiveChainIdsBySubject = (s: string) => this.inner.findLiveChainIdsBySubject(s);
  isChainRevoked(chainId: string): Promise<boolean> {
    this.isChainRevokedCalls++;
    return this.inner.isChainRevoked(chainId);
  }
}

describe('RedisCachedRefreshTokenRepository (integración contra Redis real)', () => {
  let redis: RedisClient;

  beforeAll(async () => {
    redis = await connectTestRedis(SESSION_CACHE_DB);
  });

  beforeEach(async () => {
    await redis.flushDb();
  });

  afterAll(async () => {
    await redis.flushDb();
    redis.destroy();
  });

  const silent = { log: () => undefined };

  it('una cadena viva se consulta una sola vez a la fuente de verdad', async () => {
    const source = new CountingRepository();
    const cached = new RedisCachedRefreshTokenRepository(source, redis, silent);
    for (let i = 0; i < 10; i++) expect(await cached.isChainRevoked('c1')).toBe(false);
    expect(source.isChainRevokedCalls).toBe(1);
  });

  it('revocar corta la sesion de inmediato, aunque estuviera marcada como viva', async () => {
    const source = new CountingRepository();
    const cached = new RedisCachedRefreshTokenRepository(source, redis, silent);
    await cached.register(record('t1', 'c1'));
    expect(await cached.isChainRevoked('c1')).toBe(false);
    await cached.revokeChain('c1', 'logout', T0);
    expect(await cached.isChainRevoked('c1')).toBe(true);
  });

  it('la revocacion hecha en una replica se ve al instante en otra que tenia la cadena como viva', async () => {
    const source = new CountingRepository();
    const otherReplicaRedis = await connectTestRedis(SESSION_CACHE_DB);
    try {
      const replicaA = new RedisCachedRefreshTokenRepository(source, redis, silent);
      const replicaB = new RedisCachedRefreshTokenRepository(source, otherReplicaRedis, silent);
      expect(await replicaB.isChainRevoked('c1')).toBe(false);
      await replicaA.revokeChain('c1', 'logout', T0);
      const callsBefore = source.isChainRevokedCalls;
      expect(await replicaB.isChainRevoked('c1')).toBe(true);
      expect(source.isChainRevokedCalls).toBe(callsBefore);
    } finally {
      otherReplicaRedis.destroy();
    }
  });

  it('una cadena revocada se recuerda como revocada sin volver a consultar', async () => {
    const source = new CountingRepository();
    await source.revokeChain('c1', 'logout', T0);
    const cached = new RedisCachedRefreshTokenRepository(source, redis, silent);
    for (let i = 0; i < 5; i++) expect(await cached.isChainRevoked('c1')).toBe(true);
    expect(source.isChainRevokedCalls).toBe(1);
  });

  it('limite documentado: una revocacion hecha sin pasar por el decorador se ve al vencer la marca viva', async () => {
    const source = new CountingRepository();
    const cached = new RedisCachedRefreshTokenRepository(source, redis, { ...silent, liveTtlSeconds: 1 });
    expect(await cached.isChainRevoked('c1')).toBe(false);
    await source.revokeChain('c1', 'logout', T0); // por fuera del decorador
    expect(await cached.isChainRevoked('c1')).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await cached.isChainRevoked('c1')).toBe(true);
  });

  it('las marcas llevan expiracion', async () => {
    const source = new CountingRepository();
    const cached = new RedisCachedRefreshTokenRepository(source, redis, { ...silent, liveTtlSeconds: 30, revokedTtlSeconds: 600 });
    await cached.isChainRevoked('viva');
    await cached.revokeChain('muerta', 'logout', T0);
    expect(await redis.ttl('identity:chain:live:viva')).toBeGreaterThan(0);
    expect(await redis.ttl('identity:chain:revoked:muerta')).toBeGreaterThan(0);
    expect(await redis.exists('identity:chain:live:muerta')).toBe(0);
  });

  it('con Redis caido consulta la fuente de verdad y nunca da por viva una cadena revocada', async () => {
    const dead = await connectDeadRedis();
    const source = new CountingRepository();
    await source.revokeChain('muerta', 'logout', T0);
    const cached = new RedisCachedRefreshTokenRepository(source, dead, silent);
    expect(await cached.isChainRevoked('muerta')).toBe(true);
    expect(await cached.isChainRevoked('viva')).toBe(false);
    await cached.register(record('t1', 'c9'));
    await cached.revokeChain('c9', 'logout', T0);
    expect(await cached.isChainRevoked('c9')).toBe(true);
    if (dead.isOpen) dead.destroy();
  });

  it('avisa como maximo una vez por ventana cuando Redis falla', async () => {
    const dead = await connectDeadRedis();
    const logs: string[] = [];
    const cached = new RedisCachedRefreshTokenRepository(new CountingRepository(), dead, { log: (m) => logs.push(m) });
    for (let i = 0; i < 20; i++) await cached.isChainRevoked('c1');
    expect(logs).toHaveLength(1);
    if (dead.isOpen) dead.destroy();
  });

  it('delega sin tocar el resto de operaciones del puerto', async () => {
    const source = new CountingRepository();
    const cached = new RedisCachedRefreshTokenRepository(source, redis, silent);
    await cached.register(record('t1', 'c1'));
    expect((await cached.findByTokenId('t1'))?.chainId).toBe('c1');
    expect(await cached.markUsed('t1', T0)).toBe(true);
    expect(await cached.markUsed('t1', T0)).toBe(false);
    expect(await cached.findLiveChainIdsBySubject('estudiante@upb.edu.co')).toEqual(['c1']);
  });
});
