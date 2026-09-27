import type { ReportOutcome } from '../../entities/ReportAbuse.js';

export interface ReportOutcomeRepositoryPort {
  /** Idempotente por `id`. */
  record(outcome: ReportOutcome): Promise<void>;
  /** `email` normalizado. */
  findByReporter(email: string): Promise<readonly ReportOutcome[]>;
}
