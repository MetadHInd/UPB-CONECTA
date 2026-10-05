export interface IdentityRateLimitConfig {
  readonly windowMs: number;
  readonly maxAttemptsPerAccount: number;
  readonly maxAttemptsPerOrigin: number;
}

export class InvalidIdentityRateLimitConfigError extends Error {
  constructor(motivo: string) {
    super(`Configuracion de rate limiting de identidad invalida: ${motivo}`);
    this.name = 'InvalidIdentityRateLimitConfigError';
  }
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS_PER_ACCOUNT = 5;
const DEFAULT_MAX_ATTEMPTS_PER_ORIGIN = 10;

export function readIdentityRateLimitConfig(env: NodeJS.ProcessEnv = process.env): IdentityRateLimitConfig {
  const windowMs = parsePositiveInteger(env['IDENTITY_RATE_LIMIT_WINDOW_MS'], DEFAULT_WINDOW_MS, 'IDENTITY_RATE_LIMIT_WINDOW_MS');
  const maxAttemptsPerAccount = parsePositiveInteger(
    env['IDENTITY_RATE_LIMIT_MAX_PER_ACCOUNT'],
    DEFAULT_MAX_ATTEMPTS_PER_ACCOUNT,
    'IDENTITY_RATE_LIMIT_MAX_PER_ACCOUNT'
  );
  const maxAttemptsPerOrigin = parsePositiveInteger(
    env['IDENTITY_RATE_LIMIT_MAX_PER_ORIGIN'],
    DEFAULT_MAX_ATTEMPTS_PER_ORIGIN,
    'IDENTITY_RATE_LIMIT_MAX_PER_ORIGIN'
  );

  return { windowMs, maxAttemptsPerAccount, maxAttemptsPerOrigin };
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidIdentityRateLimitConfigError(`${name} debe ser un entero positivo, se recibio "${raw}"`);
  }
  return parsed;
}
