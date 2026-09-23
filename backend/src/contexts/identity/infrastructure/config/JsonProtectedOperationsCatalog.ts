import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ProtectedOperationsCatalog } from '../../domain/ports/out/ProtectedOperationsCatalogPort.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/protected-operations.json', import.meta.url);

/**
 * Catalogo como dato de configuracion externa, no codigo — mismo patron que
 * `loadProgramCatalog` (targeting, HU-07): agregar o quitar una operacion
 * protegida es editar `config/protected-operations.json`, sin recompilar.
 * `scripts/check-declared-authorization.mjs` (criterio 5) lee el mismo
 * archivo directamente con `JSON.parse`, sin pasar por TypeScript, para
 * poder ejecutarse con Node plano (igual que `check-architecture.mjs`).
 */
export function loadProtectedOperationsCatalog(configPath: string | URL = DEFAULT_CONFIG_PATH): ProtectedOperationsCatalog {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  const raw = readFileSync(resolvedPath, 'utf8');
  return JSON.parse(raw) as ProtectedOperationsCatalog;
}
