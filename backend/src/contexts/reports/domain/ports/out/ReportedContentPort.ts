import type { ReportedContentKind, ReportedContentSnapshot } from '../../entities/ContentReportCase.js';

export interface ReportableContent extends ReportedContentSnapshot {
  readonly authorEmail: string;
  /** Ya oculto (por este mecanismo o por otro). */
  readonly hidden: boolean;
}

/**
 * Puerto hacia el contexto que posee el contenido (el foro). El ocultamiento
 * es una transicion de estado del contenido, no un borrado (HU-34 criterio 4).
 */
export interface ReportedContentPort {
  find(kind: ReportedContentKind, id: string): Promise<ReportableContent | null>;
  /** Idempotente. */
  setHidden(kind: ReportedContentKind, id: string, hidden: boolean): Promise<void>;
}
