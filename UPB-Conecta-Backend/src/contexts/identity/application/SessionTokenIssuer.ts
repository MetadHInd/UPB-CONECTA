import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { RefreshTokenRepositoryPort } from '../domain/ports/out/RefreshTokenRepositoryPort.js';
import type { SessionIdGeneratorPort } from '../domain/ports/out/SessionIdGeneratorPort.js';
import type { TokenSigningPort } from '../domain/ports/out/TokenSigningPort.js';
import type { SessionPolicy } from '../domain/value-objects/SessionPolicy.js';
import type { SessionTokens } from '../domain/value-objects/SessionTokens.js';

/**
 * Emite el par access + refresh de una cadena de rotacion (HU-45). Lo usan el
 * inicio de sesion (cadena nueva) y la renovacion (misma cadena).
 */
export class SessionTokenIssuer {
  constructor(
    private readonly dependencies: {
      readonly signer: TokenSigningPort;
      readonly refreshTokens: RefreshTokenRepositoryPort;
      readonly clock: ClockPort;
      readonly ids: SessionIdGeneratorPort;
      readonly policy: SessionPolicy;
    }
  ) {}

  startSession(subject: string): Promise<SessionTokens> {
    return this.issueInChain(subject, this.dependencies.ids.newId());
  }

  async issueInChain(subject: string, chainId: string): Promise<SessionTokens> {
    const { signer, refreshTokens, clock, ids, policy } = this.dependencies;
    // Los claims `iat`/`exp` de un JWT van en segundos: se trunca aqui para que
    // la expiracion que ve el cliente coincida exactamente con la firmada.
    const issuedAt = new Date(Math.floor(clock.now().getTime() / 1000) * 1000);
    const accessExpiresAt = policy.accessTokenExpiresAt(issuedAt);
    const refreshExpiresAt = policy.refreshTokenExpiresAt(issuedAt);
    const refreshTokenId = ids.newId();

    const [accessValue, refreshValue] = await Promise.all([
      signer.sign({ kind: 'access', subject, chainId, tokenId: ids.newId(), issuedAt, expiresAt: accessExpiresAt }),
      signer.sign({ kind: 'refresh', subject, chainId, tokenId: refreshTokenId, issuedAt, expiresAt: refreshExpiresAt })
    ]);

    await refreshTokens.register({
      tokenId: refreshTokenId,
      chainId,
      subject,
      status: 'active',
      issuedAt,
      expiresAt: refreshExpiresAt,
      usedAt: null,
      revokedAt: null,
      revokedReason: null
    });

    return {
      sessionId: chainId,
      accessToken: { value: accessValue, expiresAt: accessExpiresAt },
      refreshToken: { value: refreshValue, expiresAt: refreshExpiresAt }
    };
  }
}
