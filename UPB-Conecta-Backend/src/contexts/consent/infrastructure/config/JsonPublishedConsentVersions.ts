import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ConsentDocumentType } from '../../domain/entities/ConsentRecord.js';
import type { PublishedConsentVersions } from '../../domain/ports/out/PublishedConsentVersionsPort.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/consent-document-versions.json', import.meta.url);

/**
 * Version publicada de cada documento como dato externo, no codigo — mismo
 * patron que `loadProtectedOperationsCatalog`/`loadProgramCatalog`. Publicar
 * una version nueva (criterio 5) es editar
 * `config/consent-document-versions.json`, sin recompilar.
 */
export function loadPublishedConsentVersions(configPath: string | URL = DEFAULT_CONFIG_PATH): PublishedConsentVersions {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  const raw = readFileSync(resolvedPath, 'utf8');
  // El catalogo se lee como dato externo sin validar en tiempo de carga
  // (mismo patron que `loadProtectedOperationsCatalog`); un documento sin
  // version publicada lo detecta `currentVersionOf` en el momento de uso.
  const versions = JSON.parse(raw) as Record<ConsentDocumentType, string>;
  return { versions };
}
