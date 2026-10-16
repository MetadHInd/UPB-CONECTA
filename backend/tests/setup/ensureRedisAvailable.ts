import { createClient } from 'redis';

/**
 * globalSetup de Vitest: igual que `ensureMongoAvailable`, exige una instancia
 * real de Redis para las pruebas de los adaptadores de cache. Un doble en
 * memoria no verificaria que los comandos (conjuntos ordenados, expiracion,
 * MULTI) se comporten como el servidor real.
 */
export const REDIS_TEST_URL = process.env['REDIS_TEST_URL'] ?? 'redis://localhost:6379';

export default async function ensureRedisAvailable(): Promise<void> {
  const client = createClient({ url: REDIS_TEST_URL, socket: { connectTimeout: 2000, reconnectStrategy: false } });
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.ping();
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Redis no esta disponible en ${REDIS_TEST_URL}.\n` +
        'Las pruebas de los adaptadores de cache requieren una instancia real, no un mock.\n' +
        'Arrancala con: brew services start redis\n' +
        `Causa original: ${cause}`
    );
  } finally {
    client.destroy();
  }
}
