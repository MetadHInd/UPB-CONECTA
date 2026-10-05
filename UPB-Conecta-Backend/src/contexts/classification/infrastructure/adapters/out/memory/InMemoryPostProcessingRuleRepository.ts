import type { PostProcessingRuleData } from '../../../../domain/rules/PostProcessingRuleData.js';
import type { PostProcessingRuleRepositoryPort } from '../../../../domain/ports/out/PostProcessingRuleRepositoryPort.js';

export class InMemoryPostProcessingRuleRepository implements PostProcessingRuleRepositoryPort {
  private readonly rules = new Map<string, PostProcessingRuleData>();

  async findActiveRules(): Promise<readonly PostProcessingRuleData[]> {
    return [...this.rules.values()].filter((rule) => rule.active).map((rule) => structuredClone(rule));
  }

  async findAll(): Promise<readonly PostProcessingRuleData[]> {
    return [...this.rules.values()].map((rule) => structuredClone(rule));
  }

  async findById(id: string): Promise<PostProcessingRuleData | null> {
    const rule = this.rules.get(id);
    return rule ? structuredClone(rule) : null;
  }

  async save(rule: PostProcessingRuleData): Promise<void> {
    this.rules.set(rule.id, structuredClone(rule));
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const rule = this.rules.get(id);
    if (rule) {
      this.rules.set(id, { ...rule, active });
    }
  }
}
