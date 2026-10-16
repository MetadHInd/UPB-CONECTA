import { createClient } from 'redis';
import { REDIS_TEST_URL } from '../../setup/ensureRedisAvailable.js';
import type { RedisClient } from '../../../src/infrastructure/shared/redis.js';

/**
 * Vitest corre los archivos en paralelo: cada archivo de pruebas usa su propia
 * base de Redis (`database`) para que el `flushDb` de uno no borre las claves
 * de otro.
 */
export const RATE_LIMITER_DB = 15;
export const SESSION_CACHE_DB = 14;

export async function connectTestRedis(database: number): Promise<RedisClient> {
  const client = createClient({ url: REDIS_TEST_URL, database, disableOfflineQueue: true });
  client.on('error', () => undefined);
  await client.connect();
  return client;
}

/** Cliente que apunta a un puerto sin servidor: simula Redis caido. Los comandos fallan de inmediato. */
export async function connectDeadRedis(): Promise<RedisClient> {
  const client = createClient({
    url: 'redis://127.0.0.1:6390',
    disableOfflineQueue: true,
    socket: { connectTimeout: 300, reconnectStrategy: false }
  });
  client.on('error', () => undefined);
  await client.connect().catch(() => undefined);
  return client;
}
