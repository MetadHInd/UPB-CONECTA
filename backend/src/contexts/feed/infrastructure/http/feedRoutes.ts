import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { QueryStudentFeed } from '../../application/QueryStudentFeed.js';

export interface FeedUseCases {
  readonly queryFeed: Pick<QueryStudentFeed, 'execute'>;
}

const MAX_LIMIT = 100;
const MAX_TEXT_LENGTH = 100;

/**
 * Contrato REST del feed segmentado (RF-17, 18, 19, 20, 21, 22). Exige
 * sesion; el estudiante sale siempre del token, nunca de la peticion. Los
 * parametros opcionales `limit`, `categories` (separadas por coma) y `q` se
 * validan antes de llegar al caso de uso (RNF-15).
 */
export function createFeedRouter(
  useCases: FeedUseCases,
  requireSession: RequestHandler,
  principalEmail: (res: Response) => string
): Router {
  const router = Router();
  router.use('/feed', requireSession);

  router.get('/feed', (req: Request, res: Response, next: NextFunction) => {
    const limit = parseLimit(req.query['limit']);
    const text = parseText(req.query['q']);
    const categories = parseCategories(req.query['categories']);
    if (limit === 'invalid') return badRequest(res, 'invalid-limit', `limit debe ser un entero entre 1 y ${MAX_LIMIT}.`);
    if (text === 'invalid') return badRequest(res, 'invalid-text', `q debe ser un texto de hasta ${MAX_TEXT_LENGTH} caracteres.`);
    if (categories === 'invalid') return badRequest(res, 'invalid-category', 'categories debe ser una lista separada por comas.');
    useCases.queryFeed
      .execute({ studentEmail: principalEmail(res), limit, text, categories })
      .then((result) => {
        res.status(result.ok ? 200 : 400).json(result);
      })
      .catch(next);
  });

  return router;
}

function parseLimit(raw: unknown): number | undefined | 'invalid' {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return 'invalid';
  const value = Number(raw);
  return value >= 1 && value <= MAX_LIMIT ? value : 'invalid';
}

function badRequest(res: Response, error: string, message: string): void {
  res.status(400).json({ ok: false, error, message });
}

function parseText(raw: unknown): string | undefined | 'invalid' {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' && raw.length <= MAX_TEXT_LENGTH ? raw : 'invalid';
}

function parseCategories(raw: unknown): readonly string[] | undefined | 'invalid' {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') return 'invalid';
  return raw.split(',').map((part) => part.trim()).filter((part) => part !== '');
}
