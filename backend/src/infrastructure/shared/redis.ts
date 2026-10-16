import { createClient } from 'redis';

/** Cliente de Redis ya conectado, o `null` si no se configuro `REDIS_URL`. */
export type RedisClient = ReturnType<typeof createClient>;

/** Tope de espera por comando: Redis es una optimizacion, nunca puede frenar una peticion. */
export const REDIS_COMMAND_TIMEOUT_MS = 250;

/**
 * Crea y conecta el cliente de Redis (cache compartida entre replicas).
 *
 * Redis aqui es opcional y degradable: sin `REDIS_URL` el sistema usa MongoDB
 * como antes, y si Redis cae en marcha los adaptadores caen a MongoDB. Por eso
 * el cliente NO encola comandos mientras esta desconectado
 * (`disableOfflineQueue`): una cola haria esperar a cada peticion hasta que
 * Redis volviera, y lo que se quiere es fallar rapido y usar el respaldo.
 * Reconecta solo, con espera exponencial acotada.
 */
export async function connectRedis(url: string | undefined, log: (message: string) => void = console.log): Promise<RedisClient | null> {
  if (url === undefined || url.trim() === '') return null;

  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries) => Math.min(2 ** retries * 100, 5000) + Math.floor(Math.random() * 200)
    }
  });
  client.on('error', (error: Error) => log(`[redis] ${error.message}`));
  client.on('ready', () => log('[redis] conectado'));
  try {
    await client.connect();
  } catch (error) {
    // Arranca igual: el cliente sigue reintentando en segundo plano.
    log(`[redis] no disponible al arrancar, se usa MongoDB hasta que responda: ${(error as Error).message}`);
  }
  return client;
}

/** Ejecuta un comando de Redis con tope de espera; si tarda mas, falla para que el llamador use el respaldo. */
export function withRedisTimeout<T>(operation: Promise<T>, ms = REDIS_COMMAND_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis no respondio en ${ms} ms`)), ms);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

export function redisStatus(client: RedisClient | null): 'disabled' | 'up' | 'down' {
  if (client === null) return 'disabled';
  return client.isReady ? 'up' : 'down';
}
