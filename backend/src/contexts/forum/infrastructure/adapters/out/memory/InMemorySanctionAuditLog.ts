import type { SanctionAuditEvent, SanctionAuditPort } from '../../../../domain/ports/out/SanctionAuditPort.js';

export class InMemorySanctionAuditLog implements SanctionAuditPort {
  private readonly recorded: SanctionAuditEvent[] = [];

  get events(): readonly SanctionAuditEvent[] {
    return this.recorded;
  }

  async record(event: SanctionAuditEvent): Promise<void> {
    this.recorded.push(event);
  }
}
