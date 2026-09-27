import type { LogoutResult } from '../domain/entities/SessionResult.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { DeviceInvalidationPort } from '../domain/ports/out/DeviceInvalidationPort.js';
import type { RefreshTokenRepositoryPort } from '../domain/ports/out/RefreshTokenRepositoryPort.js';
import type { SecurityAuditLogPort } from '../domain/ports/out/SecurityAuditLogPort.js';
import type { TokenSigningPort } from '../domain/ports/out/TokenSigningPort.js';
import { verifySessionToken } from './SessionTokenVerification.js';

export interface LogoutSessionInput {
  readonly refreshToken: string;
  readonly origin: string;
  /** Dispositivo a dar de baja de esta cuenta (HU-39, criterio 2). */
  readonly deviceToken?: string;
}

/**
 * Cierre de sesion (criterio 3, RF-64): revoca la cadena completa del refresh
 * token presentado, de modo que ni ese token ni ninguno de sus predecesores
 * permita renovar. Solo se acepta un token con firma valida: un token
 * manipulado no puede usarse para cerrar la sesion de otro estudiante.
 *
 * HU-39: la revocacion de la cadena corta tambien el token de acceso
 * (`VerifyAccessToken` consulta la cadena, criterios 1 y 4) y el refresh
 * (criterio 6); ademas, si llega `deviceToken`, se invalida ese dispositivo
 * (criterio 2). La cadena se revoca primero, porque es lo que corta el
 * acceso; si la baja del dispositivo falla, el error se propaga y el cliente
 * reintenta: ambas operaciones son idempotentes.
 */
export class LogoutSession {
  constructor(
    private readonly dependencies: {
      readonly signer: TokenSigningPort;
      readonly refreshTokens: RefreshTokenRepositoryPort;
      readonly audit: SecurityAuditLogPort;
      readonly clock: ClockPort;
      readonly devices: DeviceInvalidationPort;
    }
  ) {}

  async execute(input: LogoutSessionInput): Promise<LogoutResult> {
    const verified = await verifySessionToken(this.dependencies, input.refreshToken, 'refresh', input.origin);
    if (!verified.ok) return verified;

    await this.dependencies.refreshTokens.revokeChain(verified.claims.chainId, 'logout', this.dependencies.clock.now());
    if (input.deviceToken !== undefined) {
      await this.dependencies.devices.invalidateForStudent(verified.claims.subject, input.deviceToken);
    }
    return { ok: true };
  }
}
