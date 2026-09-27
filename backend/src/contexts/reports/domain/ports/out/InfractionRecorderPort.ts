import type { ReportedContentSnapshot } from '../../entities/ContentReportCase.js';

export type InfractionRecordOutcome =
  | { readonly ok: true; readonly sanctionLevel: string | null }
  | { readonly ok: false; readonly message: string };

/**
 * Enlaza la confirmacion de un administrador con el historial de infracciones
 * de HU-35 (`RecordInfraction`) en lugar de duplicarlo.
 */
export interface InfractionRecorderPort {
  recordBlocked(input: {
    readonly studentEmail: string;
    readonly content: ReportedContentSnapshot;
    readonly reason: string;
    readonly detectedBy: string;
  }): Promise<InfractionRecordOutcome>;
}
