/**
 * HU-16 (RF-23, RF-24): "el estado de lectura es una entidad de relacion
 * estudiante-convocatoria, no un campo del documento de convocatoria" (diseno
 * de la historia en Jira) — evita contencion de escritura sobre un
 * documento leido por miles de usuarios, y por construccion dos estudiantes
 * nunca comparten fila (criterio 5).
 *
 * `convocatoriaId` es un identificador opaco para este contexto (igual que
 * `studentId`): lo produce `ingestion` (HU-15), este contexto no necesita
 * saber como se construye, solo que identifica una convocatoria de forma
 * estable.
 */
export interface ConvocatoriaPersonalState {
  readonly studentId: string;
  readonly convocatoriaId: string;
  readonly read: boolean;
  readonly saved: boolean;
  readonly archived: boolean;
  readonly updatedAt: Date;
}

export function defaultPersonalState(studentId: string, convocatoriaId: string, at: Date): ConvocatoriaPersonalState {
  return { studentId, convocatoriaId, read: false, saved: false, archived: false, updatedAt: at };
}
