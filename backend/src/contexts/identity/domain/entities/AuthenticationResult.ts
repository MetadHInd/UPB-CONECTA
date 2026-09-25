import type { IdentityProfile } from './IdentityProfile.js';
import type { SessionTokens } from '../value-objects/SessionTokens.js';
import type { ConsentRequirementResult } from '../ports/out/ConsentStatusPort.js';

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
      /**
       * HU-44, criterio 1: si el estudiante debe (re)aceptar la politica de
       * datos o las normas del foro antes de poder usar la aplicacion. La
       * futura capa HTTP usa este campo para decidir si presenta el modal de
       * consentimiento antes de dejar continuar, igual que ya usa `session`
       * para emitir las cookies/encabezados de sesion.
       */
      readonly consent: ConsentRequirementResult;
    }
  | {
      readonly ok: false;
      readonly error: AuthenticationFailureKind;
      readonly message: string;
    };
