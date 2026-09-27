import type { ContentReport, ContentReportCase } from '../../entities/ContentReportCase.js';

export interface ReportCaseRepositoryPort {
  findById(id: string): Promise<ContentReportCase | null>;
  /** Inserta solo si no existe. `false` si otra peticion lo creo antes. */
  create(reportCase: ContentReportCase): Promise<boolean>;
  /**
   * Agrega el reporte de forma atomica solo si ese reportante aun no reporto
   * en la ronda en curso (HU-34 criterio 3, tambien ante dos peticiones
   * simultaneas). `false` si ya habia un reporte suyo.
   */
  addReport(caseId: string, report: ContentReport): Promise<boolean>;
  /** Reemplaza el caso (transiciones de estado). */
  update(reportCase: ContentReportCase): Promise<void>;
  /** Casos con reportes pendientes u ocultos a la espera de revision. */
  findPendingReview(): Promise<readonly ContentReportCase[]>;
}
