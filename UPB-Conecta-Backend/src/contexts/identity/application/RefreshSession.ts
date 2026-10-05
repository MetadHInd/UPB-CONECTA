import { SessionFailureKind, type RefreshSessionResult } from '../domain/entities/SessionResult.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { RefreshTokenRepositoryPort } from '../domain/ports/out/RefreshTokenRepositoryPort.js';
import { SecurityAuditEventKind, type SecurityAuditLogPort } from '../domain/ports/out/SecurityAuditLogPort.js';
import type { TokenSigningPort } from '../domain/ports/out/TokenSigningPort.js';
import type { SessionTokenIssuer } from './SessionTokenIssuer.js';
import { sessionFailure, verifySessionToken } from './SessionTokenVerification.js';

export interface RefreshSessionInput {
  readonly refreshToken: string;
  readonly origin: string;
}

/**
 * Renovacion con rotacion y deteccion de reuso (HU-45, criterios 2 y 4).
 *
 * Cada refresh token sirve una sola vez: al usarlo se marca `used` y se emite
 * otro en la misma cadena. Si un token `used` vuelve a llegar, alguien mas
 * tiene una copia: se revoca la cadena completa y ambos, atacante y
 * estudiante, deben autenticarse de nuevo.
 */
export class RefreshSession {
  constructor(
    private readonly dependencies: {
      readonly signer: TokenSigningPort;
      readonly refreshTokens: RefreshTokenRepositoryPort;
      readonly audit: SecurityAuditLogPort;
      readonly clock: ClockPort;
      readonly sessions: SessionTokenIssuer;
    }
  ) {}

  async execute(input: RefreshSessionInput): Promise<RefreshSessionResult> {
    const { refreshTokens, clock, sessions } = this.dependencies;

    const verified = await verifySessionToken(this.dependencies, input.refreshToken, 'refresh', input.origin);
    if (!verified.ok) return verified;
    const { claims } = verified;

    const record = await refreshTokens.findByTokenId(claims.tokenId);
    if (record === null) return sessionFailure(SessionFailureKind.INVALID_TOKEN);

    if (record.status === 'revoked' || (await refreshTokens.isChainRevoked(record.chainId))) {
      return sessionFailure(SessionFailureKind.SESSION_REVOKED);
    }

    // `markUsed` es atomico: si otra renovacion con este mismo token gano la
    // carrera, esta llamada devuelve false y se trata exactamente igual que un
    // token ya marcado como usado.
    if (record.status === 'used' || !(await refreshTokens.markUsed(record.tokenId, clock.now()))) {
      return this.handleReuse(record.chainId, record.subject, input.origin);
    }

    return { ok: true, tokens: await sessions.issueInChain(record.subject, record.chainId) };
  }

  private async handleReuse(chainId: string, subject: string, origin: string): Promise<RefreshSessionResult> {
    const { refreshTokens, audit, clock } = this.dependencies;
    const at = clock.now();
    await refreshTokens.revokeChain(chainId, 'reuse-detected', at);
    await audit.record({
      kind: SecurityAuditEventKind.REFRESH_TOKEN_REUSE,
      occurredAt: at,
      origin,
      tokenKind: 'refresh',
      reason: 'reuse-detected',
      chainId,
      subject
    });
    return sessionFailure(SessionFailureKind.REFRESH_TOKEN_REUSE);
  }
}
