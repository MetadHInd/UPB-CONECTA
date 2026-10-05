import type { ConvocatoriaAuditEvent, ConvocatoriaAuditLogPort } from '../../../../domain/ports/out/ConvocatoriaAuditLogPort.js';

export class InMemoryConvocatoriaAuditLog implements ConvocatoriaAuditLogPort {
  readonly events: ConvocatoriaAuditEvent[] = [];

  async record(event: ConvocatoriaAuditEvent): Promise<void> {
    this.events.push(event);
  }
}
