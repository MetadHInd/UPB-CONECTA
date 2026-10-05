export type SessionTokenKind = 'access' | 'refresh';

export interface SessionTokenClaims {
  readonly kind: SessionTokenKind;
  readonly subject: string;
  readonly chainId: string;
  readonly tokenId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export enum TokenRejectionReason {
  EXPIRED = 'expired',
  INVALID_SIGNATURE = 'invalid-signature',
  MALFORMED = 'malformed',
  WRONG_KIND = 'wrong-kind'
}

export type TokenVerification =
  | { readonly valid: true; readonly claims: SessionTokenClaims }
  | { readonly valid: false; readonly reason: TokenRejectionReason };

/**
 * Puerto de salida para firmar y verificar tokens de sesion (HU-45).
 *
 * La criptografia vive en el adaptador de infraestructura, nunca en dominio ni
 * aplicacion. `verify` debe fallar de forma segura: cualquier token cuya firma,
 * estructura o vigencia no se pueda comprobar devuelve `valid: false`, jamas
 * lanza ni devuelve claims sin verificar (criterio 6).
 */
export interface TokenSigningPort {
  sign(claims: SessionTokenClaims): Promise<string>;
  verify(token: string, expectedKind: SessionTokenKind): Promise<TokenVerification>;
}
