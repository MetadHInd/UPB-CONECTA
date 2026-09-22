import type { RefreshTokenRecord, RefreshTokenRevocationReason } from '../../entities/RefreshTokenRecord.js';

/**
 * Cadena de refresh tokens con rotacion y deteccion de reuso (HU-45).
 */
export interface RefreshTokenRepositoryPort {
  register(record: RefreshTokenRecord): Promise<void>;

  findByTokenId(tokenId: string): Promise<RefreshTokenRecord | null>;

  /**
   * Transicion atomica `active -> used`. Devuelve `false` si el token ya no
   * estaba activo: dos renovaciones concurrentes con el mismo token no pueden
   * ganar ambas, y la perdedora se trata como reuso.
   */
  markUsed(tokenId: string, at: Date): Promise<boolean>;

  /**
   * Revoca la cadena completa: deja una marca a nivel de cadena y pasa a
   * `revoked` todos sus tokens. La marca es necesaria porque, en una carrera,
   * la renovacion ganadora puede registrar su token nuevo despues de que la
   * perdedora revoco la cadena; ese token tardio tambien debe quedar muerto.
   * Idempotente: el primer motivo registrado se conserva.
   */
  revokeChain(chainId: string, reason: RefreshTokenRevocationReason, at: Date): Promise<void>;

  isChainRevoked(chainId: string): Promise<boolean>;
}
