import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RateLimitPolicyCatalog } from '../../domain/value-objects/RateLimitPolicy.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/rate-limit-policies.json', import.meta.url);

/** Mismo patron que `loadProtectedOperationsCatalog` (HU-46) y `loadProgramCatalog` (HU-07). */
export function loadRateLimitPolicyCatalog(configPath: string | URL = DEFAULT_CONFIG_PATH): RateLimitPolicyCatalog {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  const raw = readFileSync(resolvedPath, 'utf8');
  return JSON.parse(raw) as RateLimitPolicyCatalog;
}
