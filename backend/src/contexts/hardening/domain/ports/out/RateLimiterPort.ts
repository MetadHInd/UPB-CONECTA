import type { RateLimitPolicyEntry } from '../../value-objects/RateLimitPolicy.js';

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: Date;
}

/**
 * Contrato generico de "cuenta un intento y decide si sigue dentro del
 * limite", distinto de `identity.RateLimiterPort` (HU-43): aquel es
 * especifico para bloqueo de fuerza bruta en login
 * (`checkAllowed`/`recordFailure`/`recordSuccess` sobre cuenta+origen). Este
 * es un limitador de tasa general por operacion+sujeto (HU-47, criterio 5),
 * pensado para cualquier punto de entrada, no solo autenticacion.
 */
export interface RateLimiterPort {
  consume(operation: string, subject: string, policy: RateLimitPolicyEntry): RateLimitDecision;
}
