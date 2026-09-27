import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PracticeDuplicateRules } from '../../domain/services/PracticeDuplicatePolicy.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/practice-listing-policy.json', import.meta.url);

/** Reglas de consolidacion de duplicados (HU-22 criterio 5), como datos. */
export function loadPracticeListingPolicy(configPath: string | URL = DEFAULT_CONFIG_PATH): PracticeDuplicateRules {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  return JSON.parse(readFileSync(resolvedPath, 'utf8')) as PracticeDuplicateRules;
}
