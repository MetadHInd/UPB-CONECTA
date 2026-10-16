import express, { type Express, type NextFunction, type Request, type Response, type Router } from 'express';

/**
 * Raiz de composicion de la capa HTTP (contrato REST que el `Frontend/`
 * consume — ver `Frontend/ARQUITECTURA-INTEGRACION.md`). Vive fuera de
 * `src/contexts/*` a proposito: no le pertenece a ningun contexto, monta los
 * routers que cada contexto expone en su propia `infrastructure/http/`
 * (p. ej. `identity/infrastructure/http/authRoutes.ts`) igual que `main.ts`
 * ya compone adaptadores de varios contextos sin que ninguno conozca a los
 * demas.
 *
 * Traduccion de errores a HTTP en un solo lugar: cada ruta puede lanzar y
 * dejar que `next(error)` llegue aqui, en vez de repetir el mismo `try/catch`
 * en cada handler.
 */
export interface HttpServerOptions {
  /**
   * Sondeo de disponibilidad (`GET /ready`): debe confirmar que las
   * dependencias que la API necesita para atender (MongoDB) responden. Sin
   * sondeo, `/ready` responde siempre 200.
   */
  readonly isReady?: () => Promise<boolean>;
  /** Datos informativos que se anaden al cuerpo de `/ready` (no afectan al codigo de estado). */
  readonly details?: () => Record<string, unknown>;
  /** Identificador de esta replica; se devuelve en la cabecera `X-Instance`. */
  readonly instanceId?: string;
}

export function createHttpServer(routers: readonly Router[], options: HttpServerOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  // Detras del balanceador de Railway la IP del cliente llega en
  // `X-Forwarded-For`; sin esto `req.ip` seria la del proxy y el limite de
  // tasa por origen (RNF-16) trataria a todos los clientes como uno solo.
  app.set('trust proxy', 1);
  app.use(express.json());

  if (options.instanceId !== undefined) {
    const instanceId = options.instanceId;
    app.use((_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Instance', instanceId);
      next();
    });
  }

  // Liveness: el proceso esta vivo. No consulta dependencias a proposito: si
  // MongoDB cae, reiniciar la API no lo arregla.
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  // Readiness: la replica puede recibir trafico. El balanceador deja de
  // enviarle peticiones mientras responda 503 (MongoDB caido o apagado en curso).
  app.get('/ready', (_req: Request, res: Response) => {
    const check = options.isReady ?? (async () => true);
    check()
      .then((ready) => {
        res.status(ready ? 200 : 503).json({ ok: ready, ready, ...options.details?.() });
      })
      .catch(() => {
        res.status(503).json({ ok: false, ready: false, ...options.details?.() });
      });
  });

  for (const router of routers) {
    app.use(router);
  }

  // Sin ruta: 404 explicito en el mismo formato `{ ok, error, message }` que
  // usan las respuestas de fallo de `AuthenticationResult`, para que el
  // cliente nunca tenga que distinguir "ruta inexistente" de "operacion
  // rechazada" por la forma del cuerpo.
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      ok: false,
      error: 'not-found',
      message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
    });
  });

  // Middleware de error: 4 parametros es la firma que Express usa para
  // reconocerlo como manejador de errores (debe conservar `next` aunque no
  // se use). Un cuerpo JSON malformado llega aqui como `SyntaxError` desde
  // `express.json()`; se reporta como 400, no como 500.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      res.status(400).json({ ok: false, error: 'invalid-request', message: 'El cuerpo de la solicitud no es JSON válido.' });
      return;
    }
    console.error('[http] error no controlado:', err);
    res.status(500).json({ ok: false, error: 'internal-error', message: 'Error interno del servidor.' });
  });

  return app;
}
