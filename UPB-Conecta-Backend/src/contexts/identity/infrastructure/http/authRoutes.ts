import { Router, type Request, type Response, type NextFunction } from 'express';
import { AuthenticateStudent } from '../../application/AuthenticateStudent.js';
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

export function createAuthRouter(authenticateStudent: AuthenticateStudent): Router {
  const router = Router();

  router.post('/auth/login', (req: Request, res: Response, next: NextFunction) => {
    void handleLogin(req, res, authenticateStudent).catch(next);
  });

  return router;
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
