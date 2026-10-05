/**
 * Lo unico que el feed necesita saber del estudiante para segmentar: programa
 * y semestre. `IdentityProfile` y el segmento del perfil de HU-37 son ambos
 * compatibles con esta forma, sin que `feed` dependa de `profile`.
 */
export interface StudentSegment {
  readonly program?: string | undefined;
  readonly semester?: number | undefined;
}
