import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ModerationPolicyConfig } from '../../application/ScreenContent.js';
import { ModerationThresholds } from '../../domain/value-objects/ModerationThresholds.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/moderation-policy.json', import.meta.url);

export class InvalidModerationPolicyError extends Error {
  constructor(motivo: string) {
    super(`Política de moderación inválida (config/moderation-policy.json): ${motivo}`);
    this.name = 'InvalidModerationPolicyError';
  }
}

/**
 * Umbrales, plazo y diccionario de vetados como dato (HU-31 criterio 2 y 3 a
 * 5): se editan sin recompilar. Un archivo inválido falla al arrancar en
 * lugar de moderar con valores a medias.
 */
export function loadModerationPolicy(configPath: string | URL = DEFAULT_CONFIG_PATH): ModerationPolicyConfig {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    throw new InvalidModerationPolicyError(`no se pudo leer el archivo (${error instanceof Error ? error.message : String(error)}).`);
  }
  const data = (raw ?? {}) as { thresholds?: { lower?: unknown; upper?: unknown }; timeoutMs?: unknown; bannedTerms?: unknown };
  const { lower, upper } = data.thresholds ?? {};
  if (typeof lower !== 'number' || typeof upper !== 'number') throw new InvalidModerationPolicyError('faltan thresholds.lower y thresholds.upper numéricos.');
  if (typeof data.timeoutMs !== 'number') throw new InvalidModerationPolicyError('falta timeoutMs numérico.');
  if (!Array.isArray(data.bannedTerms) || !data.bannedTerms.every((term) => typeof term === 'string')) {
    throw new InvalidModerationPolicyError('bannedTerms debe ser una lista de textos.');
  }
  return { thresholds: ModerationThresholds.of(lower, upper), timeoutMs: data.timeoutMs, bannedTerms: data.bannedTerms as string[] };
}
