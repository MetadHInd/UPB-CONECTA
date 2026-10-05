import type { LogoutResult } from '../domain/entities/SessionResult.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { RefreshTokenRepositoryPort } from '../domain/ports/out/RefreshTokenRepositoryPort.js';
import type { SecurityAuditLogPort } from '../domain/ports/out/SecurityAuditLogPort.js';
import type { TokenSigningPort } from '../domain/ports/out/TokenSigningPort.js';
import { verifySessionToken } from './SessionTokenVerification.js';

export interface LogoutSessionInput {
  readonly refreshToken: string;
  readonly origin: string;
}

/**
 * Cierre de sesion (criterio 3, RF-64): revoca la cadena completa del refresh
 * token presentado, de modo que ni ese token ni ninguno de sus predecesores
 * permita renovar. Solo se acepta un token con firma valida: un token
 * manipulado no puede usarse para cerrar la sesion de otro estudiante.
 */
export class LogoutSession {
  constructor(
    private readonly dependencies: {
      readonly signer: TokenSigningPort;
      readonly refreshTokens: RefreshTokenRepositoryPort;
      readonly audit: SecurityAuditLogPort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: LogoutSessionInput): Promise<LogoutResult> {
    const verified = await verifySessionToken(this.dependencies, input.refreshToken, 'refresh', input.origin);
    if (!verified.ok) return verified;

    await this.dependencies.refreshTokens.revokeChain(verified.claims.chainId, 'logout', this.dependencies.clock.now());
    return { ok: true };
  }
}
