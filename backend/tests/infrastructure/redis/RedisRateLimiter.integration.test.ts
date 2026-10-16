import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisRateLimiter } from '../../../src/contexts/identity/infrastructure/adapters/out/redis/RedisRateLimiter.js';
import type { IdentityRateLimitConfig } from '../../../src/contexts/identity/infrastructure/config/IdentityRateLimitConfig.js';
import type { RedisClient } from '../../../src/infrastructure/shared/redis.js';
import { connectDeadRedis, connectTestRedis, RATE_LIMITER_DB } from './redisTestClient.js';

const CONFIG: IdentityRateLimitConfig = { windowMs: 60_000, maxAttemptsPerAccount: 3, maxAttemptsPerOrigin: 5 };

describe('RedisRateLimiter (integración contra Redis real)', () => {
  let redis: RedisClient;

  beforeAll(async () => {
    redis = await connectTestRedis(RATE_LIMITER_DB);
  });

  beforeEach(async () => {
    await redis.flushDb();
  });

  afterAll(async () => {
    await redis.flushDb();
    redis.destroy();
  });

  const limiter = (config = CONFIG) => new RedisRateLimiter(redis, config);

  it('permite intentos mientras no se alcance el limite por cuenta', async () => {
    const l = limiter();
    await l.recordFailure('ana@upb.edu.co', '10.0.0.1');
    await l.recordFailure('ana@upb.edu.co', '10.0.0.1');
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.1')).toBe(true);
  });

  it('bloquea la cuenta al llegar al maximo, sin afectar a otra cuenta de otro origen', async () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) await l.recordFailure('ana@upb.edu.co', `10.0.0.${i}`);
    expect(await l.checkAllowed('ana@upb.edu.co', '10.9.9.9')).toBe(false);
    expect(await l.checkAllowed('luis@upb.edu.co', '10.9.9.9')).toBe(true);
  });

  it('normaliza mayusculas y espacios en cuenta y origen', async () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) await l.recordFailure(' ANA@upb.edu.co ', '10.0.0.1');
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.2')).toBe(false);
  });

  it('bloquea el origen al llegar a su maximo aunque las cuentas sean distintas', async () => {
    const l = limiter();
    for (let i = 0; i < 5; i++) await l.recordFailure(`cuenta${i}@upb.edu.co`, '10.0.0.1');
    expect(await l.checkAllowed('otra@upb.edu.co', '10.0.0.1')).toBe(false);
  });

  it('un login correcto limpia los intentos de esa cuenta y origen', async () => {
    const l = limiter();
    for (let i = 0; i < 3; i++) await l.recordFailure('ana@upb.edu.co', '10.0.0.1');
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.1')).toBe(false);
    await l.recordSuccess('ana@upb.edu.co', '10.0.0.1');
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.1')).toBe(true);
  });

  it('ignora los intentos fuera de la ventana (ventana deslizante)', async () => {
    const l = limiter({ ...CONFIG, windowMs: 200 });
    for (let i = 0; i < 3; i++) await l.recordFailure('ana@upb.edu.co', '10.0.0.1');
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.1')).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.1')).toBe(true);
  });

  it('las claves llevan expiracion y desaparecen al terminar la ventana', async () => {
    const l = limiter({ ...CONFIG, windowMs: 150 });
    await l.recordFailure('ana@upb.edu.co', '10.0.0.1');
    const keys = await redis.keys('identity:rl:*');
    expect(keys).toHaveLength(3);
    for (const key of keys) {
      const ttl = await redis.pTTL(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(150);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(await redis.exists(keys)).toBe(0);
  });

  it('comparte el conteo entre dos clientes (dos replicas de la API)', async () => {
    const otherReplica = await connectTestRedis(RATE_LIMITER_DB);
    try {
      const replicaA = limiter();
      const replicaB = new RedisRateLimiter(otherReplica, CONFIG);
      await replicaA.recordFailure('ana@upb.edu.co', '10.0.0.1');
      await replicaB.recordFailure('ana@upb.edu.co', '10.0.0.2');
      await replicaA.recordFailure('ana@upb.edu.co', '10.0.0.3');
      expect(await replicaB.checkAllowed('ana@upb.edu.co', '10.0.0.4')).toBe(false);
    } finally {
      otherReplica.destroy();
    }
  });

  it('fallos concurrentes no se pierden', async () => {
    const l = limiter({ ...CONFIG, maxAttemptsPerAccount: 50, maxAttemptsPerOrigin: 200 });
    await Promise.all(Array.from({ length: 50 }, () => l.recordFailure('ana@upb.edu.co', '10.0.0.1')));
    expect(await l.checkAllowed('ana@upb.edu.co', '10.0.0.1')).toBe(false);
  });

  it('con Redis caido lanza rapido (sin colgar) para que el respaldo entre', async () => {
    const dead = await connectDeadRedis();
    const started = Date.now();
    await expect(new RedisRateLimiter(dead, CONFIG).checkAllowed('ana@upb.edu.co', '10.0.0.1')).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(1000);
    if (dead.isOpen) dead.destroy();
  });
});
