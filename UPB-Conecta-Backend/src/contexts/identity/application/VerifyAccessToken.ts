import { SessionFailureKind, type VerifyAccessTokenResult } from '../domain/entities/SessionResult.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { RefreshTokenRepositoryPort } from '../domain/ports/out/RefreshTokenRepositoryPort.js';
import type { SecurityAuditLogPort } from '../domain/ports/out/SecurityAuditLogPort.js';
import type { TokenSigningPort } from '../domain/ports/out/TokenSigningPort.js';
import { sessionFailure, verifySessionToken } from './SessionTokenVerification.js';

export interface VerifyAccessTokenInput {
  readonly accessToken: string;
  readonly origin: string;
}

/**
 * Punto de entrada que una capa HTTP futura invocara en cada peticion
 * autenticada (criterios 1 y 6). La firma y la vigencia las comprueba el
 * adaptador de `TokenSigningPort`; este caso de uso solo agrega que la cadena
 * no haya sido revocada por logout o por reuso, para que cerrar sesion corte
 * tambien el acceso vigente en lugar de esperar a que expire.
 */
export class VerifyAccessToken {
  constructor(
    private readonly dependencies: {
      readonly signer: TokenSigningPort;
      readonly refreshTokens: RefreshTokenRepositoryPort;
      readonly audit: SecurityAuditLogPort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: VerifyAccessTokenInput): Promise<VerifyAccessTokenResult> {
    const verified = await verifySessionToken(this.dependencies, input.accessToken, 'access', input.origin);
    if (!verified.ok) return verified;
    const { claims } = verified;

    if (await this.dependencies.refreshTokens.isChainRevoked(claims.chainId)) {
      return sessionFailure(SessionFailureKind.SESSION_REVOKED);
    }

    return { ok: true, principal: { subject: claims.subject, sessionId: claims.chainId } };
  }
}
