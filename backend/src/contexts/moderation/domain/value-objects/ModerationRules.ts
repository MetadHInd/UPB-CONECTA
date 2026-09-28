import { normalizeForMatching } from '../services/TextNormalization.js';
import type { ModerationThresholds } from './ModerationThresholds.js';

/**
 * Reglas vigentes de la moderación automática (HU-52): umbrales de severidad
 * y diccionario de expresiones vetadas. Son configuración de dominio que el
 * administrador ajusta (criterios 1 y 2), no constantes del código.
 * `config/moderation-policy.json` solo aporta los valores iniciales.
 */
export interface ModerationRules {
  readonly thresholds: ModerationThresholds;
  readonly bannedTerms: readonly string[];
}

export const BANNED_TERM_MAX_LENGTH = 80;

/** Como se guarda una expresión: sin espacios sobrantes, tal como la escribió el administrador. */
export function tidyBannedTerm(term: string): string {
  return term.trim().replace(/\s+/g, ' ');
}

/**
 * Dos expresiones son la misma si coinciden sin distinguir mayúsculas,
 * tildes ni espacios, igual que las compara `BannedTermsDictionary`: "Gonorrea"
 * y "gonorréa" no son dos entradas.
 */
export function sameBannedTerm(a: string, b: string): boolean {
  return matchingKey(a) === matchingKey(b);
}

function matchingKey(term: string): string {
  return normalizeForMatching(tidyBannedTerm(term));
}
