import type { SanctionThresholds } from '../../value-objects/SanctionThresholds.js';

export interface StoredSanctionThresholds {
  readonly thresholds: SanctionThresholds;
  /** `null` mientras rigen los valores por defecto. */
  readonly updatedBy: string | null;
  readonly updatedAt: Date | null;
}

/**
 * Umbrales administrables (HU-35 criterio 7), mismo patron que
 * `ReviewThresholdConfigPort` (HU-10): se leen en cada infraccion, sin cache,
 * para que un ajuste aplique a la siguiente sin redespliegue.
 */
export interface SanctionThresholdsRepositoryPort {
  /** Sin configuracion guardada, devuelve `SanctionThresholds.default()`. */
  get(): Promise<StoredSanctionThresholds>;
  set(thresholds: SanctionThresholds, change: { readonly updatedBy: string; readonly updatedAt: Date }): Promise<void>;
}
