import type { InstitutionalProgramCatalog } from '../../../targeting/domain/ports/out/ProgramCatalogPort.js';
import { ProgramCatalogMatcher } from '../../../targeting/domain/services/ProgramCatalogMatcher.js';
import type { ProgramCatalogPort } from '../../domain/ports/out/ProgramCatalogPort.js';

/**
 * Resuelve el programa del directorio contra el mismo catalogo que usa el
 * targeting (`config/program-catalog.json`), de modo que perfil y
 * convocatorias hablen de programas con los mismos ids.
 */
export class TargetingProgramCatalogAdapter implements ProgramCatalogPort {
  private readonly matcher: ProgramCatalogMatcher;

  constructor(catalog: InstitutionalProgramCatalog) {
    this.matcher = new ProgramCatalogMatcher(catalog);
  }

  resolveProgramId(directoryProgram: string): string | null {
    return this.matcher.resolveProgramId(directoryProgram);
  }
}
