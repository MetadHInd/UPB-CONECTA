import { SessionPolicy } from '../../domain/value-objects/SessionPolicy.js';

export interface SessionConfig {
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly signingSecret: string;
  readonly issuer: string;
  readonly audience: string;
}

export class InvalidSessionConfigError extends Error {
  constructor(motivo: string) {
    super(`Configuracion de sesion invalida: ${motivo}`);
    this.name = 'InvalidSessionConfigError';
  }
}

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_ISSUER = 'upb-conecta';
const DEFAULT_AUDIENCE = 'upb-conecta-app';
// HS256 usa una clave de 256 bits; un secreto mas corto debilita la firma.
const MIN_SECRET_LENGTH = 32;

/**
 * Politica de expiracion leida del entorno al arrancar (HU-45 criterio 5):
 * ajustar las vigencias es cambiar una variable y reiniciar, no recompilar.
 * Mismo patron que `IdentityRateLimitConfig` (HU-43).
 */
export function readSessionConfig(env: NodeJS.ProcessEnv = process.env): SessionConfig {
  const signingSecret = env['SESSION_SIGNING_SECRET'] ?? '';
  if (signingSecret.length < MIN_SECRET_LENGTH) {
    throw new InvalidSessionConfigError(
      `SESSION_SIGNING_SECRET es obligatorio y debe tener al menos ${MIN_SECRET_LENGTH} caracteres`
    );
  }

  const config: SessionConfig = {
    accessTokenTtlSeconds: parsePositiveInteger(
      env['SESSION_ACCESS_TOKEN_TTL_SECONDS'],
      DEFAULT_ACCESS_TOKEN_TTL_SECONDS,
      'SESSION_ACCESS_TOKEN_TTL_SECONDS'
    ),
    refreshTokenTtlSeconds: parsePositiveInteger(
      env['SESSION_REFRESH_TOKEN_TTL_SECONDS'],
      DEFAULT_REFRESH_TOKEN_TTL_SECONDS,
      'SESSION_REFRESH_TOKEN_TTL_SECONDS'
    ),
    signingSecret,
    issuer: nonEmpty(env['SESSION_TOKEN_ISSUER'], DEFAULT_ISSUER),
    audience: nonEmpty(env['SESSION_TOKEN_AUDIENCE'], DEFAULT_AUDIENCE)
  };

  // Falla al arrancar, no al primer login, si las vigencias no son coherentes.
  SessionPolicy.create(config);
  return config;
}

function nonEmpty(raw: string | undefined, fallback: string): string {
  return raw === undefined || raw.trim() === '' ? fallback : raw.trim();
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidSessionConfigError(`${name} debe ser un entero positivo de segundos, se recibio "${raw}"`);
  }
  return parsed;
}
