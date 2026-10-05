import type { SessionTokenKind, TokenRejectionReason } from './TokenSigningPort.js';

export enum SecurityAuditEventKind {
  TOKEN_REJECTED = 'token-rejected',
  REFRESH_TOKEN_REUSE = 'refresh-token-reuse'
}

/**
 * Evento de seguridad de la sesion. Nunca incluye el token presentado: un
 * token, incluso manipulado, es material de credencial y no va a un log.
 */
export interface SecurityAuditEvent {
  readonly kind: SecurityAuditEventKind;
  readonly occurredAt: Date;
  readonly origin: string;
  readonly tokenKind: SessionTokenKind;
  readonly reason: TokenRejectionReason | 'reuse-detected';
  readonly chainId?: string;
  readonly subject?: string;
}

export interface SecurityAuditLogPort {
  record(event: SecurityAuditEvent): Promise<void>;
}
