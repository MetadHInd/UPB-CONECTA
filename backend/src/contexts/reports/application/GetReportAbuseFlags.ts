import type { ReportAbuseFlag } from '../domain/entities/ReportAbuse.js';
import type { ReportAbuseFlagRepositoryPort } from '../domain/ports/out/ReportAbuseFlagRepositoryPort.js';

/**
 * Cuentas con un patron de reportes infundados (HU-34 criterio 6), para que
 * el administrador evalue si abusan de la funcion. Mas afectadas primero.
 * Declarada en `config/protected-operations.json`.
 */
export class GetReportAbuseFlags {
  constructor(private readonly dependencies: { readonly abuseFlags: ReportAbuseFlagRepositoryPort }) {}

  async execute(): Promise<readonly ReportAbuseFlag[]> {
    const open = await this.dependencies.abuseFlags.findOpen();
    return [...open].sort((a, b) => b.unfoundedCount - a.unfoundedCount || a.flaggedAt.getTime() - b.flaggedAt.getTime());
  }
}
