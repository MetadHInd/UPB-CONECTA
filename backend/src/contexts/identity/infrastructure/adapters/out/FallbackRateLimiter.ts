import type { RateLimiterPort } from '../../../domain/ports/out/RateLimiterPort.js';

/**
 * Usa `primary` (Redis) y, si lanza, `secondary` (MongoDB): el limite de
 * intentos sigue aplicandose aunque Redis este caido, en vez de abrirse (que
 * permitiria fuerza bruta) o cerrarse (que bloquearia a todos). Registra el
 * cambio de estado una sola vez en cada sentido para no inundar los logs.
 */
export class FallbackRateLimiter implements RateLimiterPort {
  private degraded = false;

  constructor(
    private readonly primary: RateLimiterPort,
    private readonly secondary: RateLimiterPort,
    private readonly log: (message: string) => void = console.log
  ) {}

  checkAllowed(accountId: string, origin: string): Promise<boolean> {
    return this.run((limiter) => limiter.checkAllowed(accountId, origin));
  }

  recordFailure(accountId: string, origin: string): Promise<void> {
    return this.run((limiter) => limiter.recordFailure(accountId, origin));
  }

  recordSuccess(accountId: string, origin: string): Promise<void> {
    return this.run((limiter) => limiter.recordSuccess(accountId, origin));
  }

  private async run<T>(operation: (limiter: RateLimiterPort) => T | Promise<T>): Promise<T> {
    try {
      const result = await operation(this.primary);
      if (this.degraded) {
        this.degraded = false;
        this.log('[rate-limit] Redis responde de nuevo');
      }
      return result;
    } catch (error) {
      if (!this.degraded) {
        this.degraded = true;
        this.log(`[rate-limit] Redis fallo, se usa MongoDB: ${(error as Error).message}`);
      }
      return operation(this.secondary);
    }
  }
}
