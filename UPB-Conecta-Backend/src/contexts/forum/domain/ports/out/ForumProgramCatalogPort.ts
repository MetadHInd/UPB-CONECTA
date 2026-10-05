/**
 * Traduce el programa del directorio al id del catalogo (mismo contrato que
 * el `ProgramCatalogPort` de `profile`). `ProgramCatalogMatcher` de
 * `targeting` lo cumple tal cual.
 */
export interface ForumProgramCatalogPort {
  resolveProgramId(directoryProgram: string): string | null;
}
