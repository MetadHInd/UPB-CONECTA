/**
 * Tokens de sesion emitidos al estudiante (HU-45). `value` es el token firmado
 * en forma compacta; el dominio lo trata como opaco porque firmar y verificar
 * es responsabilidad del adaptador de `TokenSigningPort`.
 */
export interface AccessToken {
  readonly value: string;
  readonly expiresAt: Date;
}

export interface RefreshToken {
  readonly value: string;
  readonly expiresAt: Date;
}

/**
 * `sessionId` identifica la cadena de rotacion: todos los refresh tokens que
 * descienden del mismo inicio de sesion comparten este identificador.
 */
export interface SessionTokens {
  readonly sessionId: string;
  readonly accessToken: AccessToken;
  readonly refreshToken: RefreshToken;
}
