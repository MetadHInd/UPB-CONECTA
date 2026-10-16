import { Router, type Request, type Response, type NextFunction } from 'express';
import { AuthenticateStudent } from '../../application/AuthenticateStudent.js';
import type { LogoutSession } from '../../application/LogoutSession.js';
import type { RefreshSession } from '../../application/RefreshSession.js';
import { AuthenticationFailureKind } from '../../domain/entities/AuthenticationResult.js';

/**
 * Primer endpoint del contrato REST (HU-43/44/45): `POST /auth/login`.
 * Traduce el resultado de `AuthenticateStudent` (union discriminada, sin
 * excepciones para los fallos esperados) a codigo de estado + cuerpo JSON.
 * No repite logica de negocio: rate limiting, sincronizacion de perfil/foro
 * y evaluacion de consentimiento ya ocurrieron dentro del caso de uso.
 */
const STATUS_BY_FAILURE: Record<AuthenticationFailureKind, number> = {
  [AuthenticationFailureKind.INVALID_CREDENTIALS]: 401,
  [AuthenticationFailureKind.PROVIDER_UNAVAILABLE]: 503,
  [AuthenticationFailureKind.RATE_LIMITED]: 429
};

export function createAuthRouter(
  authenticateStudent: AuthenticateStudent,
  sessions?: { readonly refresh: RefreshSession; readonly logout: LogoutSession }
): Router {
  const router = Router();

  router.post('/auth/login', (req: Request, res: Response, next: NextFunction) => {
    void handleLogin(req, res, authenticateStudent).catch(next);
  });

  if (sessions) {
    // HU-45: renovacion con rotacion. Devuelve un par nuevo; el refresh token
    // presentado queda usado y no sirve otra vez.
    router.post('/auth/refresh', (req: Request, res: Response, next: NextFunction) => {
      void (async () => {
        const refreshToken = readRefreshToken(req, res);
        if (refreshToken === null) return;
        const result = await sessions.refresh.execute({ refreshToken, origin: req.ip ?? 'unknown' });
        res.status(result.ok ? 200 : 401).json(result.ok ? { ok: true, session: result.tokens } : result);
      })().catch(next);
    });

    // HU-45 criterio 3: cerrar sesion revoca la cadena completa.
    router.post('/auth/logout', (req: Request, res: Response, next: NextFunction) => {
      void (async () => {
        const refreshToken = readRefreshToken(req, res);
        if (refreshToken === null) return;
        const result = await sessions.logout.execute({ refreshToken, origin: req.ip ?? 'unknown' });
        res.status(result.ok ? 200 : 401).json(result);
      })().catch(next);
    });
  }

  return router;
}

function readRefreshToken(req: Request, res: Response): string | null {
  const refreshToken = (req.body as Record<string, unknown> | null | undefined)?.['refreshToken'];
  if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    res.status(400).json({ ok: false, error: 'invalid-request', message: 'refreshToken es obligatorio.' });
    return null;
  }
  return refreshToken.trim();
}

async function handleLogin(req: Request, res: Response, authenticateStudent: AuthenticateStudent): Promise<void> {
  const body = req.body as Record<string, unknown> | null | undefined;
  const username = body?.['username'];
  const password = body?.['password'];
  // El origen alimenta el rate limiting por origen (HU-43). El cliente Android
  // no tiene una nocion natural de "origen web"; se fija un valor constante
  // hasta que exista mas de un cliente que necesite distinguirse.
  const rawOrigin = body?.['origin'];
  const origin = typeof rawOrigin === 'string' && rawOrigin.trim() !== '' ? rawOrigin.trim() : 'android-app';

  if (typeof username !== 'string' || username.trim() === '' || typeof password !== 'string' || password === '') {
    res.status(400).json({
      ok: false,
      error: 'invalid-request',
      message: 'username y password son obligatorios.'
    });
    return;
  }

  const result = await authenticateStudent.execute({ username, password, origin });

  if (result.ok) {
    res.status(200).json(result);
    return;
  }

  res.status(STATUS_BY_FAILURE[result.error] ?? 400).json(result);
}
