import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ConsentRequiredOperationsCatalog } from '../../domain/ports/out/ConsentRequiredOperationsCatalogPort.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/consent-required-operations.json', import.meta.url);

/**
 * Mismo patron que `loadProtectedOperationsCatalog` (HU-46): lee el catalogo
 * declarativo desde `config/consent-required-operations.json`, sin que
 * agregar una operacion exija tocar TypeScript.
 */
export function loadConsentRequiredOperationsCatalog(
  configPath: string | URL = DEFAULT_CONFIG_PATH
): ConsentRequiredOperationsCatalog {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  const raw = readFileSync(resolvedPath, 'utf8');
  return JSON.parse(raw) as ConsentRequiredOperationsCatalog;
}
