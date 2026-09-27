import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { RefreshTokenRepositoryPort } from '../domain/ports/out/RefreshTokenRepositoryPort.js';

/**
 * HU-48: cierra todas las sesiones de un titular (una cadena de refresh tokens por dispositivo o
 * inicio de sesión). Se usa al suprimir sus datos: ningún refresh token puede seguir renovando una
 * sesión de una cuenta cuyos datos ya no existen. Idempotente; devuelve cuántas cadenas revocó.
 * El token de acceso vigente vence solo, por su expiración corta.
 */
export class EndAllSessionsForSubject {
  constructor(private readonly dependencies: { readonly refreshTokens: RefreshTokenRepositoryPort; readonly clock: ClockPort }) {}

  async execute(subject: string): Promise<number> {
    const { refreshTokens, clock } = this.dependencies;
    const chains = await refreshTokens.findLiveChainIdsBySubject(subject.trim().toLowerCase());
    const now = clock.now();
    for (const chainId of chains) await refreshTokens.revokeChain(chainId, 'data-erasure', now);
    return chains.length;
  }
}
