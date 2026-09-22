import type { IdentityProfile } from './IdentityProfile.js';
import type { SessionTokens } from '../value-objects/SessionTokens.js';

export enum AuthenticationFailureKind {
  INVALID_CREDENTIALS = 'invalid-credentials',
  PROVIDER_UNAVAILABLE = 'provider-unavailable',
  RATE_LIMITED = 'rate-limited'
}

export const AuthenticationError = AuthenticationFailureKind;

export type AuthenticationResult =
  | {
      readonly ok: true;
      readonly profile: IdentityProfile;
      readonly message: string;
      /** Par access + refresh de la sesion recien iniciada (HU-45). */
      readonly session: SessionTokens;
    }
  | {
      readonly ok: false;
      readonly error: AuthenticationFailureKind;
      readonly message: string;
    };
