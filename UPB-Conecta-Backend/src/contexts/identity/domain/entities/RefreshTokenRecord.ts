export type RefreshTokenStatus = 'active' | 'used' | 'revoked';

export type RefreshTokenRevocationReason = 'logout' | 'reuse-detected';

/**
 * Estado persistido de un refresh token emitido (HU-45). El token firmado no
 * se guarda: basta su `tokenId` (claim `jti`) para reconocerlo al volver.
 *
 * - `active`: el unico token de la cadena que todavia permite renovar.
 * - `used`: ya se roto; si vuelve a presentarse es un reuso (criterio 4).
 * - `revoked`: la cadena se invalido por cierre de sesion o por reuso.
 */
export interface RefreshTokenRecord {
  readonly tokenId: string;
  readonly chainId: string;
  readonly subject: string;
  readonly status: RefreshTokenStatus;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revokedReason: RefreshTokenRevocationReason | null;
}
