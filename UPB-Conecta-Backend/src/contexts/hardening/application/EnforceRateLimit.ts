import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { RateLimitAuditLogPort } from '../domain/ports/out/RateLimitAuditLogPort.js';
import type { RateLimiterPort } from '../domain/ports/out/RateLimiterPort.js';
import { policyFor, type RateLimitPolicyCatalog } from '../domain/value-objects/RateLimitPolicy.js';

export interface EnforceRateLimitCommand {
  readonly operation: string;
  readonly subject: string;
  readonly origin: string;
}

export type RateLimitOutcome = { readonly allowed: true } | { readonly allowed: false; readonly retryAfterMs: number };

/**
 * Una operacion sin politica declarada no tiene limite: es un error de quien
 * programa el adaptador de entrada (deberia invocar esto solo para
 * operaciones catalogadas), mismo criterio que `UnknownProtectedOperationError`
 * de HU-46 — el catalogo es la unica fuente de verdad.
 */
export class UnknownRateLimitedOperationError extends Error {
  constructor(operation: string) {
    super(`La operacion '${operation}' no tiene una politica de limite de tasa declarada en config/rate-limit-policies.json.`);
    this.name = 'UnknownRateLimitedOperationError';
  }
}

export interface EnforceRateLimitDependencies {
  readonly catalog: RateLimitPolicyCatalog;
  readonly limiter: RateLimiterPort;
  readonly auditLog: RateLimitAuditLogPort;
  readonly clock: ClockPort;
}

/**
 * HU-47 (RNF-13, RNF-15, RNF-16), criterios 5 y 6: punto de enganche para el
 * adaptador de entrada futuro, mismo patron que `AuthorizeOperation` (HU-46)
 * y `VerifyAccessToken` (HU-45) — "no haber servidor HTTP no impide
 * implementar la historia". El adaptador que exista mas adelante traduce
 * `allowed: false` al codigo HTTP 429 (criterio 6); ese mapeo en si es
 * responsabilidad de esa capa, no de este caso de uso.
 */
export class EnforceRateLimit {
  constructor(private readonly deps: EnforceRateLimitDependencies) {}

  async execute(command: EnforceRateLimitCommand): Promise<RateLimitOutcome> {
    const policy = policyFor(this.deps.catalog, command.operation);
    if (!policy) {
      throw new UnknownRateLimitedOperationError(command.operation);
    }

    const decision = this.deps.limiter.consume(command.operation, command.subject, policy);

    if (!decision.allowed) {
      await this.deps.auditLog.record({
        operation: command.operation,
        subject: command.subject,
        origin: command.origin,
        limit: policy.limit,
        windowMs: policy.windowMs,
        occurredAt: this.deps.clock.now()
      });
      return { allowed: false, retryAfterMs: Math.max(0, decision.resetAt.getTime() - this.deps.clock.now().getTime()) };
    }

    return { allowed: true };
  }
}
