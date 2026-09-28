import type { ModerationRules } from '../../value-objects/ModerationRules.js';

export interface StoredModerationRules {
  readonly rules: ModerationRules;
  /** `null` mientras rigen los valores iniciales de `config/moderation-policy.json`. */
  readonly updatedBy: string | null;
  readonly updatedAt: Date | null;
}

/**
 * Reglas vigentes de la moderación (HU-52 criterios 1 y 2). `ScreenContent`
 * las lee en cada evaluación, así que un cambio aplica a la siguiente sin
 * redespliegue. Sin nada guardado, el adaptador devuelve los valores iniciales.
 */
export interface ModerationRulesRepositoryPort {
  get(): Promise<StoredModerationRules>;
  save(rules: ModerationRules, change: { readonly updatedBy: string; readonly updatedAt: Date }): Promise<void>;
}
