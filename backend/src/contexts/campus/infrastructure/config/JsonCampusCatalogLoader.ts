import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CampusCatalog } from '../../domain/entities/CampusCatalog.js';
import { assertValidCampusCatalog } from '../../domain/services/CampusCatalogValidation.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/campus-catalog.json', import.meta.url);

/** Carga y valida el catalogo semilla del campus (dato en `config/`, no codigo). */
export function loadCampusCatalog(configPath: string | URL = DEFAULT_CONFIG_PATH): CampusCatalog {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  return assertValidCampusCatalog(JSON.parse(readFileSync(resolvedPath, 'utf8')) as CampusCatalog);
}
