import type { ModerationRulesRepositoryPort, StoredModerationRules } from '../../../../domain/ports/out/ModerationRulesRepositoryPort.js';
import type { ModerationRules } from '../../../../domain/value-objects/ModerationRules.js';

export class InMemoryModerationRulesRepository implements ModerationRulesRepositoryPort {
  private stored: StoredModerationRules;

  /** `initial`: los valores de `config/moderation-policy.json`, vigentes hasta el primer ajuste. */
  constructor(initial: ModerationRules) {
    this.stored = { rules: { thresholds: initial.thresholds, bannedTerms: [...initial.bannedTerms] }, updatedBy: null, updatedAt: null };
  }

  async get(): Promise<StoredModerationRules> {
    return { ...this.stored, rules: { ...this.stored.rules, bannedTerms: [...this.stored.rules.bannedTerms] } };
  }

  async save(rules: ModerationRules, change: { readonly updatedBy: string; readonly updatedAt: Date }): Promise<void> {
    this.stored = { rules: { thresholds: rules.thresholds, bannedTerms: [...rules.bannedTerms] }, ...change };
  }
}
