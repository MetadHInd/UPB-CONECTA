import type { IdentityCredentials, IdentityProfile, IdentityProviderPort } from '../domain/ports/out/IdentityProviderPort.js';
import type { RateLimiterPort } from '../domain/ports/out/RateLimiterPort.js';
import { AuthenticationFailureKind, type AuthenticationResult } from '../domain/entities/AuthenticationResult.js';
import type { SessionTokenIssuer } from './SessionTokenIssuer.js';

export interface AuthenticateStudentInput extends IdentityCredentials {}

export class ProviderUnavailableError extends Error {
  constructor(message = 'El directorio institucional no está disponible en este momento.') {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor(message = 'Credenciales inválidas.') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export class AuthenticateStudent {
  constructor(
    private readonly dependencies: {
      readonly provider: IdentityProviderPort;
      readonly rateLimiter: RateLimiterPort;
      readonly sessions: SessionTokenIssuer;
    }
  ) {}

  async execute(input: AuthenticateStudentInput): Promise<AuthenticationResult> {
    const accountId = input.username.trim().toLowerCase();
    const origin = input.origin.trim();

    if (!this.dependencies.rateLimiter.checkAllowed(accountId, origin)) {
      return {
        ok: false,
        error: AuthenticationFailureKind.RATE_LIMITED,
        message: 'Demasiados intentos. Intente de nuevo más tarde.'
      };
    }

    let profile: IdentityProfile;
    try {
      profile = await this.dependencies.provider.authenticate(input);
    } catch (error) {
      this.dependencies.rateLimiter.recordFailure(accountId, origin);

      if (error instanceof ProviderUnavailableError) {
        return {
          ok: false,
          error: AuthenticationFailureKind.PROVIDER_UNAVAILABLE,
          message: 'El directorio institucional no está disponible en este momento.'
        };
      }

      return {
        ok: false,
        error: AuthenticationFailureKind.INVALID_CREDENTIALS,
        message: 'Credenciales inválidas.'
      };
    }

    this.dependencies.rateLimiter.recordSuccess(accountId, origin);
    // HU-45: el sujeto del token es el correo institucional, que el proveedor
    // siempre devuelve (a diferencia de `studentId`, que es opcional).
    const session = await this.dependencies.sessions.startSession(profile.email);
    return {
      ok: true,
      profile,
      message: 'Autenticación correcta.',
      session
    };
  }
}
