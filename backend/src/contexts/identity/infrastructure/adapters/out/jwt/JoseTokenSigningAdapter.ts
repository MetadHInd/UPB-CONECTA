import { errors, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type { ClockPort } from '../../../../domain/ports/out/ClockPort.js';
import {
  TokenRejectionReason,
  type SessionTokenClaims,
  type SessionTokenKind,
  type TokenSigningPort,
  type TokenVerification
} from '../../../../domain/ports/out/TokenSigningPort.js';
import type { SessionConfig } from '../../../config/SessionConfig.js';

const ALGORITHM = 'HS256';

/**
 * Firma y verificacion de tokens de sesion con JWT HS256 usando `jose`
 * (HU-45, RNF-17). Es el unico lugar del backend que toca criptografia de
 * sesion; dominio y aplicacion solo ven `TokenSigningPort`.
 *
 * Claims propios: `token_use` distingue acceso de refresco (un refresh token
 * nunca sirve como acceso ni al reves) y `sid` es la cadena de rotacion.
 */
export class JoseTokenSigningAdapter implements TokenSigningPort {
  private readonly key: Uint8Array;

  constructor(
    private readonly config: Pick<SessionConfig, 'signingSecret' | 'issuer' | 'audience'>,
    private readonly clock: ClockPort
  ) {
    this.key = new TextEncoder().encode(config.signingSecret);
  }

  async sign(claims: SessionTokenClaims): Promise<string> {
    return new SignJWT({ token_use: claims.kind, sid: claims.chainId })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setSubject(claims.subject)
      .setJti(claims.tokenId)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt(toEpochSeconds(claims.issuedAt))
      .setExpirationTime(toEpochSeconds(claims.expiresAt))
      .sign(this.key);
  }

  async verify(token: string, expectedKind: SessionTokenKind): Promise<TokenVerification> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.key, {
        // Lista cerrada de algoritmos: impide `alg: none` y la confusion de
        // algoritmos (p. ej. presentar un token RS256 firmado con la clave publica).
        algorithms: [ALGORITHM],
        issuer: this.config.issuer,
        audience: this.config.audience,
        requiredClaims: ['sub', 'jti', 'iat', 'exp'],
        currentDate: this.clock.now()
      }));
    } catch (error) {
      return { valid: false, reason: classify(error) };
    }

    const kind = payload['token_use'];
    const chainId = payload['sid'];
    if ((kind !== 'access' && kind !== 'refresh') || typeof chainId !== 'string' || chainId === '') {
      return { valid: false, reason: TokenRejectionReason.MALFORMED };
    }
    if (kind !== expectedKind) {
      return { valid: false, reason: TokenRejectionReason.WRONG_KIND };
    }

    return {
      valid: true,
      claims: {
        kind,
        subject: payload.sub!,
        chainId,
        tokenId: payload.jti!,
        issuedAt: new Date(payload.iat! * 1000),
        expiresAt: new Date(payload.exp! * 1000)
      }
    };
  }
}

/**
 * `jose` verifica la firma antes que los claims, asi que `JWTExpired` solo
 * llega con una firma valida: un token vencido y ademas manipulado se reporta
 * como firma invalida. Cualquier error no reconocido se trata como malformado;
 * nunca como valido.
 */
function classify(error: unknown): TokenRejectionReason {
  if (error instanceof errors.JWTExpired) return TokenRejectionReason.EXPIRED;
  if (error instanceof errors.JWSSignatureVerificationFailed || error instanceof errors.JOSEAlgNotAllowed) {
    return TokenRejectionReason.INVALID_SIGNATURE;
  }
  return TokenRejectionReason.MALFORMED;
}

function toEpochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
