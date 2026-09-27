import type { ReportAbuseFlag } from '../../entities/ReportAbuse.js';

export interface ReportAbuseFlagRepositoryPort {
  findByReporter(email: string): Promise<ReportAbuseFlag | null>;
  /** Una marca por cuenta: crea o actualiza. */
  save(flag: ReportAbuseFlag): Promise<void>;
  findOpen(): Promise<readonly ReportAbuseFlag[]>;
}
