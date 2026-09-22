/**
 * Autor verificado del foro (HU-30 criterios 1 y 2): lo que el directorio
 * institucional dijo del estudiante en su ultima autenticacion. No existe un
 * "nombre para mostrar" editable: estos datos solo los escribe la
 * sincronizacion con el directorio.
 *
 * Por que un registro propio del foro y no `StudentProfile` (HU-37): el perfil
 * de segmentacion no guarda el nombre por minimizacion (HU-37 criterio 6), y
 * el directorio no se puede consultar al publicar porque exige la contrasena.
 * El nombre se conserva solo aqui, para el proposito que lo necesita.
 */
export interface ForumAuthor {
  readonly email: string;
  readonly name: string;
  /** Programa tal como lo entrega el directorio: es lo que se muestra. */
  readonly programName: string;
  /** Id del catalogo institucional para restricciones de tema; `null` si no se reconoce. */
  readonly programId: string | null;
  readonly syncedAt: Date;
}

/** Datos del directorio que el foro necesita; `IdentityProfile` es compatible. */
export interface DirectoryAuthorRecord {
  readonly name: string;
  readonly email: string;
  readonly program: string;
}

export function normalizeForumEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Autor con nombre real: la condicion minima para no ser anonimo (criterio 2). */
export function isVerifiedAuthor(author: ForumAuthor | null): author is ForumAuthor {
  return author !== null && author.name.trim() !== '';
}
