import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { VerifyAccessToken } from '../../application/VerifyAccessToken.js';
import type { SessionPrincipal } from '../../domain/entities/SessionResult.js';

/**
 * Middleware de Express para endpoints autenticados (HU-45): exige
 * `Authorization: Bearer <access token>`, lo verifica con `VerifyAccessToken`
 * (firma, vigencia y cadena no revocada) y deja el principal en
 * `res.locals.principal`. Las rutas leen la identidad de ahi, nunca del
 * cuerpo de la peticion.
 *
 * Con un token vencido responde 401 con `requiresReauthentication: false`:
 * el cliente debe renovar con `POST /auth/refresh` y reintentar.
 */
export function requireSession(verifyAccessToken: VerifyAccessToken): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const header = req.get('authorization') ?? '';
      const match = /^Bearer\s+(.+)$/i.exec(header);
      if (!match?.[1]) {
        res.status(401).json({
          ok: false,
          error: 'missing-token',
          message: 'Falta el token de sesión.',
          requiresReauthentication: true
        });
        return;
      }

      const result = await verifyAccessToken.execute({ accessToken: match[1].trim(), origin: req.ip ?? 'unknown' });
      if (!result.ok) {
        res.status(401).json(result);
        return;
      }

      res.locals['principal'] = result.principal;
      next();
    })().catch(next);
  };
}

export function sessionPrincipal(res: Response): SessionPrincipal {
  const principal = res.locals['principal'] as SessionPrincipal | undefined;
  if (!principal) throw new Error('requireSession no se ejecutó antes de esta ruta.');
  return principal;
}
