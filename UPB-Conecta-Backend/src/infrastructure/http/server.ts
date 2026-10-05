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
export function createHttpServer(routers: readonly Router[]): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
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
