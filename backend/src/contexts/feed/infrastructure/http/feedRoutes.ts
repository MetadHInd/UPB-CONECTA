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
    if (!limit.ok) return badRequest(res, 'invalid-limit', `limit debe ser un entero entre 1 y ${MAX_LIMIT}.`);
    if (!text.ok) return badRequest(res, 'invalid-text', `q debe ser un texto de hasta ${MAX_TEXT_LENGTH} caracteres.`);
    if (!categories.ok) return badRequest(res, 'invalid-category', 'categories debe ser una lista separada por comas.');
    useCases.queryFeed
      .execute({ studentEmail: principalEmail(res), limit: limit.value, text: text.value, categories: categories.value })
      .then((result) => {
        res.status(result.ok ? 200 : 400).json(result);
      })
      .catch(next);
  });

  return router;
}

type Parsed<T> = { readonly ok: true; readonly value: T | undefined } | { readonly ok: false };

function parseLimit(raw: unknown): Parsed<number> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return { ok: false };
  const value = Number(raw);
  return value >= 1 && value <= MAX_LIMIT ? { ok: true, value } : { ok: false };
}

function badRequest(res: Response, error: string, message: string): void {
  res.status(400).json({ ok: false, error, message });
}

function parseText(raw: unknown): Parsed<string> {
  if (raw === undefined) return { ok: true, value: undefined };
  return typeof raw === 'string' && raw.length <= MAX_TEXT_LENGTH ? { ok: true, value: raw } : { ok: false };
}

function parseCategories(raw: unknown): Parsed<readonly string[]> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== 'string') return { ok: false };
  return { ok: true, value: raw.split(',').map((part) => part.trim()).filter((part) => part !== '') };
}
