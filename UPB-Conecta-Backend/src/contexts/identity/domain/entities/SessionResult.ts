import type { SessionTokens } from '../value-objects/SessionTokens.js';

export enum SessionFailureKind {
  TOKEN_EXPIRED = 'token-expired',
  INVALID_TOKEN = 'invalid-token',
  SESSION_REVOKED = 'session-revoked',
  REFRESH_TOKEN_REUSE = 'refresh-token-reuse'
}

export interface SessionFailure {
  readonly ok: false;
  readonly error: SessionFailureKind;
  readonly message: string;
  /**
   * `false` solo cuando basta renovar con el refresh token (acceso expirado).
   * En cualquier otro caso el cliente debe volver a pedir credenciales.
   */
  readonly requiresReauthentication: boolean;
}

export interface SessionPrincipal {
  readonly subject: string;
  readonly sessionId: string;
}

export type RefreshSessionResult = { readonly ok: true; readonly tokens: SessionTokens } | SessionFailure;

export type VerifyAccessTokenResult = { readonly ok: true; readonly principal: SessionPrincipal } | SessionFailure;

export type LogoutResult = { readonly ok: true } | SessionFailure;
