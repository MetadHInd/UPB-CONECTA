import type { ModerationAuditLogPort, ModerationDecisionRecord } from '../../../../domain/ports/out/ModerationAuditLogPort.js';

export class InMemoryModerationAuditLog implements ModerationAuditLogPort {
  readonly decisions: ModerationDecisionRecord[] = [];

  async record(decision: ModerationDecisionRecord): Promise<void> {
    this.decisions.push(decision);
  }

  async findAll(): Promise<readonly ModerationDecisionRecord[]> {
    return [...this.decisions];
  }
}
