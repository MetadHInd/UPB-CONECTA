import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { ConverseWithChatbot } from '../../application/ConverseWithChatbot.js';

export interface ChatbotUseCases {
  readonly converse: Pick<ConverseWithChatbot, 'execute'>;
}

const MAX_QUESTION_LENGTH = 1000;

/**
 * Contrato REST del chatbot de preguntas frecuentes (RF-65, 67, 68, 69).
 * Exige sesion. El contexto de la conversacion se ata al identificador de la
 * sesion del token, de modo que se descarta al cerrar sesion (RF-69). No se
 * envia ningun dato identificatorio del estudiante al proveedor (RNF-19):
 * solo el texto de la pregunta.
 */
export function createChatbotRouter(
  useCases: ChatbotUseCases,
  requireSession: RequestHandler,
  sessionIdOf: (res: Response) => string
): Router {
  const router = Router();
  router.use('/chatbot', requireSession);

  router.post('/chatbot/ask', (req: Request, res: Response, next: NextFunction) => {
    const question = (req.body as Record<string, unknown> | undefined)?.['question'];
    if (typeof question !== 'string' || question.trim() === '' || question.length > MAX_QUESTION_LENGTH) {
      res.status(400).json({
        ok: false,
        error: 'invalid-question',
        message: `La pregunta debe ser un texto de entre 1 y ${MAX_QUESTION_LENGTH} caracteres.`
      });
      return;
    }
    useCases.converse
      .execute({ sessionId: sessionIdOf(res), question })
      .then((answer) => {
        if (answer.kind === 'invalid-question') {
          res.status(400).json({ ok: false, error: 'invalid-question', message: 'La pregunta no es válida.' });
          return;
        }
        res.status(200).json({ ok: true, answer });
      })
      .catch(next);
  });

  return router;
}
