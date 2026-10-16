import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { GetConversation } from '../../application/GetConversation.js';
import type { ListConversations } from '../../application/ListConversations.js';
import type { ListMessagingStudents } from '../../application/ListMessagingStudents.js';
import type { SendMessage } from '../../application/SendMessage.js';
import type { StartConversation } from '../../application/StartConversation.js';
import { MessagingFailureKind, type MessagingFailure } from '../../domain/entities/MessagingFailure.js';

const STATUS_BY_FAILURE: Record<MessagingFailureKind, number> = {
  [MessagingFailureKind.FORBIDDEN]: 403,
  [MessagingFailureKind.NOT_FOUND]: 404,
  [MessagingFailureKind.INVALID_CONTENT]: 400
};

export interface MessagingUseCases {
  readonly listConversations: ListConversations;
  readonly getConversation: GetConversation;
  readonly startConversation: StartConversation;
  readonly sendMessage: SendMessage;
  readonly listStudents: ListMessagingStudents;
}

/**
 * Contrato REST de la mensajeria profesor <-> estudiante. Todas las rutas
 * exigen sesion (`requireSession`); quien pregunta sale siempre del token
 * (`principalEmail`), nunca del cuerpo de la peticion.
 */
export function createMessagingRouter(
  useCases: MessagingUseCases,
  requireSession: RequestHandler,
  principalEmail: (res: Response) => string
): Router {
  const router = Router();
  router.use('/messaging', requireSession);

  router.get('/messaging/conversations', handle(async (_req, res) => {
    const conversations = await useCases.listConversations.execute({ requesterEmail: principalEmail(res) });
    res.status(200).json({ ok: true, conversations });
  }));

  router.get('/messaging/conversations/:id', handle(async (req, res) => {
    const result = await useCases.getConversation.execute({ requesterEmail: principalEmail(res), conversationId: param(req, 'id') });
    if (!result.ok) return fail(res, result);
    res.status(200).json(result);
  }));

  router.post('/messaging/conversations', handle(async (req, res) => {
    const body = bodyOf(req);
    const result = await useCases.startConversation.execute({
      requesterEmail: principalEmail(res),
      studentEmail: body['studentEmail'],
      subject: body['subject'],
      text: body['text']
    });
    if (!result.ok) return fail(res, result);
    res.status(201).json(result);
  }));

  router.post('/messaging/conversations/:id/messages', handle(async (req, res) => {
    const result = await useCases.sendMessage.execute({
      requesterEmail: principalEmail(res),
      conversationId: param(req, 'id'),
      text: bodyOf(req)['text']
    });
    if (!result.ok) return fail(res, result);
    res.status(201).json(result);
  }));

  router.get('/messaging/students', handle(async (_req, res) => {
    const result = await useCases.listStudents.execute({ requesterEmail: principalEmail(res) });
    if (!result.ok) return fail(res, result);
    res.status(200).json(result);
  }));

  return router;
}

function handle(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
}

function fail(res: Response, failure: MessagingFailure): void {
  res.status(STATUS_BY_FAILURE[failure.error]).json(failure);
}

function param(req: Request, name: string): string {
  return String(req.params[name] ?? '');
}

function bodyOf(req: Request): Readonly<Record<string, unknown>> {
  const body: unknown = req.body;
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}
