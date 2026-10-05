/**
 * HU-19 y HU-20: puerto de salida que declara la forma que `notifications`
 * necesita de `profile` — mismo patron que `ConsentStatusPort` (`identity`,
 * HU-44): el contexto consumidor declara su propio tipo, sin importar nada
 * del dominio de `profile`; un adaptador en la infraestructura de
 * `notifications` (`ProfileStudentDirectoryAdapter`) traduce.
 *
 * `programId: null` significa "el directorio institucional entrego un
 * programa que el catalogo no reconoce" (mismo significado que
 * `DirectoryProjection.programId` en `profile`) — ese estudiante solo entra
 * en el publico de una convocatoria dirigida a toda la comunidad.
 */
export interface StudentDirectoryEntry {
  readonly studentId: string;
  readonly programId: string | null;
}

export interface StudentDirectoryPort {
  findAll(): Promise<readonly StudentDirectoryEntry[]>;
}
