import type { EscalationLogPort, EscalationRecord } from '../../../../domain/ports/out/EscalationLogPort.js';

export class InMemoryEscalationLog implements EscalationLogPort {
  readonly records: EscalationRecord[] = [];

  async record(escalation: EscalationRecord): Promise<void> {
    this.records.push(escalation);
  }
}
