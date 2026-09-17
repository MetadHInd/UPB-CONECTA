import type { IdentityProfile } from './IdentityProfile.js';

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
    }
  | {
      readonly ok: false;
      readonly error: AuthenticationFailureKind;
      readonly message: string;
    };
