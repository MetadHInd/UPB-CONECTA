import { SanctionThresholds } from '../../../../domain/value-objects/SanctionThresholds.js';
import type {
  SanctionThresholdsRepositoryPort,
  StoredSanctionThresholds
} from '../../../../domain/ports/out/SanctionThresholdsRepositoryPort.js';

export class InMemorySanctionThresholdsRepository implements SanctionThresholdsRepositoryPort {
  private stored: StoredSanctionThresholds = { thresholds: SanctionThresholds.default(), updatedBy: null, updatedAt: null };

  async get(): Promise<StoredSanctionThresholds> {
    return this.stored;
  }

  async set(thresholds: SanctionThresholds, change: { readonly updatedBy: string; readonly updatedAt: Date }): Promise<void> {
    this.stored = { thresholds, ...change };
  }
}
