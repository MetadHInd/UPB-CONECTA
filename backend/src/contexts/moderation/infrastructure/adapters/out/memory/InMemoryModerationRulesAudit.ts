import type { ModerationRulesAuditPort, ModerationRulesChange } from '../../../../domain/ports/out/ModerationRulesAuditPort.js';

export class InMemoryModerationRulesAudit implements ModerationRulesAuditPort {
  readonly changes: ModerationRulesChange[] = [];

  async record(change: ModerationRulesChange): Promise<void> {
    this.changes.push(structuredClone(change));
  }

  async findAll(): Promise<readonly ModerationRulesChange[]> {
    return [...this.changes].reverse().map((change) => structuredClone(change));
  }
}
