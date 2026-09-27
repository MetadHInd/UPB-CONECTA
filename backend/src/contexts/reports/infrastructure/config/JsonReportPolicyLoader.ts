import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ReportPolicy, type ReportPolicyValues } from '../../domain/value-objects/ReportPolicy.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/community-reports.json', import.meta.url);

/** Mismo patron que `loadRateLimitPolicyCatalog` (HU-55): datos en `backend/config/`, validados al cargar. */
export function loadReportPolicy(configPath: string | URL = DEFAULT_CONFIG_PATH): ReportPolicy {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  return ReportPolicy.of(JSON.parse(readFileSync(resolvedPath, 'utf8')) as ReportPolicyValues);
}
