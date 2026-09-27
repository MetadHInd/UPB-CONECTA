import { buildReportQueue, type ReportQueueItem } from '../domain/services/ReportQueueView.js';
import type { ReportPolicy } from '../domain/value-objects/ReportPolicy.js';
import type { ReportCaseRepositoryPort } from '../domain/ports/out/ReportCaseRepositoryPort.js';

/**
 * Cola de reportes para el administrador (HU-34 criterio 1). Muestra causas y
 * reportantes: es una vista de moderacion, nunca de cara al autor (criterio
 * 2). Declarada en `config/protected-operations.json`.
 */
export class GetReportQueue {
  constructor(private readonly dependencies: { readonly cases: ReportCaseRepositoryPort; readonly policy: ReportPolicy }) {}

  async execute(): Promise<readonly ReportQueueItem[]> {
    return buildReportQueue(await this.dependencies.cases.findPendingReview(), this.dependencies.policy);
  }
}
