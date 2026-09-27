/**
 * Politica de retencion (HU-48, RNF-22/24): plazos y periodos como datos, no
 * como constantes de codigo. Se lee de `config/data-retention-policy.json`.
 */
export interface DirectoryCorrectionChannel {
  readonly name: string;
  readonly instructions: string;
}

export interface RetainedRecordNotice {
  readonly area: string;
  readonly description: string;
  readonly erasable: boolean;
}

export interface RetentionPolicy {
  /** Dias maximos entre la solicitud de supresion y su ejecucion (criterio 4). */
  readonly erasureDeadlineDays: number;
  /** Dias tras la fecha de cierre a partir de los cuales una convocatoria se archiva (criterio 6). */
  readonly convocatoriaArchiveAfterDays: number;
  /** Canal al que se remite la correccion de datos que provee el directorio (criterio 3). */
  readonly directoryCorrectionChannel: DirectoryCorrectionChannel;
  /** Lo que se conserva tras una supresion y por que (criterios 1 y 5). */
  readonly retainedRecords: readonly RetainedRecordNotice[];
}

export const DAY_MS = 86_400_000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}
