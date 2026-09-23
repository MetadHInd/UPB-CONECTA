import type { AuthorizationAuditEvent, AuthorizationAuditLogPort } from '../../../../domain/ports/out/AuthorizationAuditLogPort.js';

export class InMemoryAuthorizationAuditLog implements AuthorizationAuditLogPort {
  readonly events: AuthorizationAuditEvent[] = [];

  async record(event: AuthorizationAuditEvent): Promise<void> {
    this.events.push(event);
  }
}
