import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { DirectoryRecord } from '../../domain/entities/StudentProfile.js';
import type { ViewStudentProfile } from '../../application/ViewStudentProfile.js';
import { ProfileUpdateFailureKind, type UpdateStudentProfile } from '../../application/UpdateStudentProfile.js';

export interface ProfileUseCases {
  readonly viewProfile: Pick<ViewStudentProfile, 'execute'>;
  readonly updateProfile: Pick<UpdateStudentProfile, 'execute'>;
  /** Registro del directorio institucional del estudiante, o null si no existe. */
  readonly findDirectoryRecord: (email: string) => Promise<DirectoryRecord | null>;
}

const STATUS_BY_FAILURE: Record<ProfileUpdateFailureKind, number> = {
  [ProfileUpdateFailureKind.READ_ONLY_FIELD]: 403,
  [ProfileUpdateFailureKind.UNKNOWN_FIELD]: 400,
  [ProfileUpdateFailureKind.NO_CHANGES]: 400,
  [ProfileUpdateFailureKind.SEMESTER_OUT_OF_RANGE]: 400,
  [ProfileUpdateFailureKind.PROFILE_NOT_FOUND]: 404,
  [ProfileUpdateFailureKind.CONCURRENT_MODIFICATION]: 409
};

/**
 * Contrato REST del perfil (RF-59, RF-60). Consulta y actualizacion del
 * semestre del propio estudiante; el correo sale del token. Los campos del
 * directorio son de solo lectura y el caso de uso los rechaza.
 */
export function createProfileRouter(
  useCases: ProfileUseCases,
  requireSession: RequestHandler,
  principalEmail: (res: Response) => string
): Router {
  const router = Router();
  router.use('/profile', requireSession);

  router.get('/profile', handle(async (_req, res) => {
    const record = await useCases.findDirectoryRecord(principalEmail(res));
    if (record === null) {
      res.status(404).json({ ok: false, error: 'profile-not-found', message: 'No hay un perfil de estudiante para esta cuenta.' });
      return;
    }
    res.status(200).json({ ok: true, profile: await useCases.viewProfile.execute(record) });
  }));

  router.put('/profile', handle(async (req, res) => {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      res.status(400).json({ ok: false, error: 'invalid-body', message: 'El cuerpo debe ser un objeto JSON.' });
      return;
    }
    const result = await useCases.updateProfile.execute({
      email: principalEmail(res),
      changes: body as Record<string, unknown>
    });
    if (!result.ok) {
      res.status(STATUS_BY_FAILURE[result.error]).json(result);
      return;
    }
    res.status(200).json(result);
  }));

  return router;
}

function handle(fn: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
}
