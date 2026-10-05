/** HU-47, criterio 6: "el evento queda registrado" cuando se supera un limite de tasa. */
export interface RateLimitExceededEvent {
  readonly operation: string;
  readonly subject: string;
  readonly origin: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly occurredAt: Date;
}

export interface RateLimitAuditLogPort {
  record(event: RateLimitExceededEvent): Promise<void>;
}
