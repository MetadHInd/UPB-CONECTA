import type { InstitutionalProgramCatalog } from '../ports/out/ProgramCatalogPort.js';
import { normalizeCatalogText } from './CatalogTextNormalization.js';

/**
 * Traduce el programa tal como lo entrega una fuente externa al id del
 * catalogo institucional (correccion del bug 3). Acepta el id o el nombre,
 * comparados con la normalizacion del catalogo, porque todavia no se conoce
 * el contrato del directorio real: si entrega ids funciona, si entrega
 * nombres tambien. Un codigo externo (p. ej. SNIES) se resolveria agregandolo
 * al catalogo, no cambiando esta clase.
 *
 * Lee el catalogo en cada llamada (sin indice precalculado) para que una
 * actualizacion del catalogo en memoria aplique sin reconstruir el objeto.
 */
export class ProgramCatalogMatcher {
  constructor(private readonly catalog: InstitutionalProgramCatalog) {}

  /** Id del catalogo, o `null` si no hay coincidencia o si es ambigua. */
  resolveProgramId(value: string): string | null {
    const wanted = normalizeCatalogText(value);
    if (wanted === '') return null;

    const byId = this.catalog.programs.find((program) => program.id === value.trim());
    if (byId) return byId.id;

    const matches = this.catalog.programs.filter(
      (program) => normalizeCatalogText(program.id) === wanted || normalizeCatalogText(program.name) === wanted
    );
    // Ante dos candidatos no se adivina: un programa equivocado mostraria
    // convocatorias ajenas, peor que mostrar solo las de toda la comunidad.
    return matches.length === 1 ? matches[0]!.id : null;
  }
}
