import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { InstitutionalProgramCatalog } from '../../domain/ports/out/ProgramCatalogPort.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/program-catalog.json', import.meta.url);

export async function loadProgramCatalog(
  configPath: string | URL = DEFAULT_CONFIG_PATH
): Promise<InstitutionalProgramCatalog> {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  const raw = readFileSync(resolvedPath, 'utf8');
  return JSON.parse(raw) as InstitutionalProgramCatalog;
}
