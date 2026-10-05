import { SessionFailureKind, type SessionFailure } from '../domain/entities/SessionResult.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { SecurityAuditEventKind, type SecurityAuditLogPort } from '../domain/ports/out/SecurityAuditLogPort.js';
import {
  TokenRejectionReason,
  type SessionTokenClaims,
  type SessionTokenKind,
  type TokenSigningPort
} from '../domain/ports/out/TokenSigningPort.js';

export function sessionFailure(error: SessionFailureKind, requiresReauthentication = true): SessionFailure {
  return { ok: false, error, message: FAILURE_MESSAGES[error], requiresReauthentication };
}

const FAILURE_MESSAGES: Record<SessionFailureKind, string> = {
  [SessionFailureKind.TOKEN_EXPIRED]: 'La sesión expiró.',
  [SessionFailureKind.INVALID_TOKEN]: 'Sesión inválida. Inicie sesión de nuevo.',
  [SessionFailureKind.SESSION_REVOKED]: 'La sesión fue cerrada. Inicie sesión de nuevo.',
  [SessionFailureKind.REFRESH_TOKEN_REUSE]: 'La sesión fue cerrada por seguridad. Inicie sesión de nuevo.'
};

/**
 * Pide al adaptador de firma que verifique el token y traduce el rechazo a un
 * resultado de sesion. Todo rechazo que no sea una expiracion normal se
 * registra en la auditoria (criterio 6): firma invalida, token malformado o
 * de otro tipo son intentos sospechosos; un token vencido no lo es.
 */
export async function verifySessionToken(
  deps: { readonly signer: TokenSigningPort; readonly audit: SecurityAuditLogPort; readonly clock: ClockPort },
  token: string,
  kind: SessionTokenKind,
  origin: string
): Promise<{ readonly ok: true; readonly claims: SessionTokenClaims } | SessionFailure> {
  const verification = await deps.signer.verify(token, kind);
  if (verification.valid) return { ok: true, claims: verification.claims };

  if (verification.reason === TokenRejectionReason.EXPIRED) {
    return sessionFailure(SessionFailureKind.TOKEN_EXPIRED, kind === 'refresh');
  }

  await deps.audit.record({
    kind: SecurityAuditEventKind.TOKEN_REJECTED,
    occurredAt: deps.clock.now(),
    origin,
    tokenKind: kind,
    reason: verification.reason
  });
  return sessionFailure(SessionFailureKind.INVALID_TOKEN);
}
