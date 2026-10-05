export class InvalidSessionPolicyError extends Error {
  constructor(motivo: string) {
    super(`Politica de sesion invalida: ${motivo}`);
    this.name = 'InvalidSessionPolicyError';
  }
}

/**
 * Politica de expiracion de la sesion (HU-45, RF-72, RNF-17).
 *
 * El dominio decide cuanto vive cada token; los valores concretos llegan desde
 * configuracion (`SessionConfig`) para poder ajustarlos sin recompilar
 * (criterio 5). Verificar si un token presentado sigue vigente NO es asunto de
 * esta clase: eso lo hace el adaptador de firma en infraestructura.
 */
export class SessionPolicy {
  private constructor(
    readonly accessTokenTtlSeconds: number,
    readonly refreshTokenTtlSeconds: number
  ) {}

  static create(params: { accessTokenTtlSeconds: number; refreshTokenTtlSeconds: number }): SessionPolicy {
    const { accessTokenTtlSeconds, refreshTokenTtlSeconds } = params;
    if (!Number.isInteger(accessTokenTtlSeconds) || accessTokenTtlSeconds <= 0) {
      throw new InvalidSessionPolicyError('la vigencia del token de acceso debe ser un entero positivo de segundos');
    }
    if (!Number.isInteger(refreshTokenTtlSeconds) || refreshTokenTtlSeconds <= 0) {
      throw new InvalidSessionPolicyError('la vigencia del token de refresco debe ser un entero positivo de segundos');
    }
    // Si el acceso viviera mas que el refresco, la ventana de un token robado
    // dejaria de ser "corta" y cerrar sesion no acotaria nada.
    if (accessTokenTtlSeconds >= refreshTokenTtlSeconds) {
      throw new InvalidSessionPolicyError('el token de acceso debe expirar antes que el token de refresco');
    }
    return new SessionPolicy(accessTokenTtlSeconds, refreshTokenTtlSeconds);
  }

  accessTokenExpiresAt(issuedAt: Date): Date {
    return new Date(issuedAt.getTime() + this.accessTokenTtlSeconds * 1000);
  }

  refreshTokenExpiresAt(issuedAt: Date): Date {
    return new Date(issuedAt.getTime() + this.refreshTokenTtlSeconds * 1000);
  }
}
