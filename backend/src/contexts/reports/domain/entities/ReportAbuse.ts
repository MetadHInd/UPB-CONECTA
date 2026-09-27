/**
 * Resultado de un reporte ya resuelto por el administrador (HU-34 criterio
 * 6). `unfounded`: el contenido se restauro, el reporte no tenia sustento.
 */
export type ReportOutcomeKind = 'unfounded' | 'founded';

export interface ReportOutcome {
  /** `caseId:decidedAt:reporterEmail`: registrar dos veces la misma decision no duplica. */
  readonly id: string;
  readonly reporterEmail: string;
  readonly caseId: string;
  readonly outcome: ReportOutcomeKind;
  readonly decidedAt: Date;
}

export function reportOutcomeId(caseId: string, decidedAt: Date, reporterEmail: string): string {
  return `${caseId}:${decidedAt.getTime()}:${reporterEmail}`;
}

/**
 * Patron de reportes infundados de una misma cuenta, registrado para que el
 * administrador evalue si abusa de la funcion. Es un registro, no una
 * sancion: la historia no define consecuencias automaticas para el reportante.
 */
export interface ReportAbuseFlag {
  readonly reporterEmail: string;
  readonly unfoundedCount: number;
  readonly windowDays: number;
  readonly caseIds: readonly string[];
  readonly flaggedAt: Date;
  readonly updatedAt: Date;
  readonly status: 'open';
}
