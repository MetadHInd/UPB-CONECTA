import type { ClockPort } from '../../../../domain/ports/out/ClockPort.js';
import type { RateLimitDecision, RateLimiterPort } from '../../../../domain/ports/out/RateLimiterPort.js';
import type { RateLimitPolicyEntry } from '../../../../domain/value-objects/RateLimitPolicy.js';

/**
 * Ventana deslizante en memoria: guarda las marcas de tiempo de los
 * intentos recientes por `operation:subject` y descarta las que caen fuera
 * de la ventana vigente en cada consulta. Solo en memoria, a proposito —
 * mismo alcance que `InMemoryRateLimiter` de `identity` (HU-43): un
 * limitador de tasa asume un solo proceso, y no existe todavia (ni lo pide
 * esta historia) una necesidad de compartir el conteo entre instancias del
 * backend.
 */
export class InMemorySlidingWindowRateLimiter implements RateLimiterPort {
  private readonly attempts = new Map<string, number[]>();

  constructor(private readonly clock: ClockPort) {}

  consume(operation: string, subject: string, policy: RateLimitPolicyEntry): RateLimitDecision {
    const key = `${operation}:${subject}`;
    const now = this.clock.now().getTime();
    const windowStart = now - policy.windowMs;
    const recent = (this.attempts.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    const allowed = recent.length < policy.limit;
    if (allowed) {
      recent.push(now);
    }
    this.attempts.set(key, recent);

    const oldest = recent[0] ?? now;
    return {
      allowed,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - recent.length),
      resetAt: new Date(oldest + policy.windowMs)
    };
  }
}
