import { createSemesterBounds, type SemesterBounds } from '../../domain/value-objects/SemesterNumber.js';

export interface ProfileConfig {
  readonly semesterBounds: SemesterBounds;
}

export class InvalidProfileConfigError extends Error {
  constructor(motivo: string) {
    super(`Configuracion de perfil invalida: ${motivo}`);
    this.name = 'InvalidProfileConfigError';
  }
}

// Cubre pregrados de 10 semestres y Medicina con internado; ajustable por entorno.
const DEFAULT_SEMESTER_MAX = 12;

/** Mismo patron que `IdentityRateLimitConfig` y `SessionConfig`. */
export function readProfileConfig(env: NodeJS.ProcessEnv = process.env): ProfileConfig {
  const raw = env['PROFILE_SEMESTER_MAX'];
  if (raw === undefined || raw.trim() === '') return { semesterBounds: createSemesterBounds(DEFAULT_SEMESTER_MAX) };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidProfileConfigError(`PROFILE_SEMESTER_MAX debe ser un entero positivo, se recibio "${raw}"`);
  }
  return { semesterBounds: createSemesterBounds(parsed) };
}
