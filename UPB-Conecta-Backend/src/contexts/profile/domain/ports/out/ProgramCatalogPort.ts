/**
 * Traduce el programa que entrega el directorio al id del catalogo con el que
 * se segmenta el feed (correccion del bug 3). `null` = no reconocido.
 */
export interface ProgramCatalogPort {
  resolveProgramId(directoryProgram: string): string | null;
}
