import type { ConsentDocumentType } from '../../entities/ConsentRecord.js';

/**
 * HU-44, criterios 1 y 3: version actualmente publicada de cada documento de
 * consentimiento. Mismo patron que `ProtectedOperationsCatalogPort` (HU-46):
 * dato de configuracion externo, no una constante en el dominio — publicar
 * una version nueva de la politica es una decision editorial, no un cambio
 * de codigo, y `ConsentPolicy` (criterio 5) ya exige version exacta para
 * considerar vigente una aceptacion previa.
 */
export interface PublishedConsentVersions {
  readonly versions: Readonly<Record<ConsentDocumentType, string>>;
}

/** `null` si el catalogo no declara version publicada para ese documento (catalogo incompleto). */
export function currentVersionOf(catalog: PublishedConsentVersions, documentType: ConsentDocumentType): string | null {
  return catalog.versions[documentType] ?? null;
}
