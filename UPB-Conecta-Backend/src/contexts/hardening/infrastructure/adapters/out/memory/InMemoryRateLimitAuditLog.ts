import type { RateLimitAuditLogPort, RateLimitExceededEvent } from '../../../../domain/ports/out/RateLimitAuditLogPort.js';

export class InMemoryRateLimitAuditLog implements RateLimitAuditLogPort {
  readonly events: RateLimitExceededEvent[] = [];

  async record(event: RateLimitExceededEvent): Promise<void> {
    this.events.push(event);
  }
}
