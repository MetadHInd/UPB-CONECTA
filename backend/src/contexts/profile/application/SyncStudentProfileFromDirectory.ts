import { normalizeEmail, StudentProfile, type DirectoryRecord } from '../domain/entities/StudentProfile.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { StudentProfileRepositoryPort } from '../domain/ports/out/StudentProfileRepositoryPort.js';
import type { SemesterBounds } from '../domain/value-objects/SemesterNumber.js';
import { saveWithRetry } from './saveWithRetry.js';

export class ProfileSyncConflictError extends Error {
  constructor(email: string) {
    super(`No se pudo sincronizar el perfil de ${email}: modificacion concurrente persistente.`);
    this.name = 'ProfileSyncConflictError';
  }
}

/**
 * Sincroniza el perfil con el directorio en cada autenticacion (HU-37): crea
 * el perfil la primera vez y, despues, refresca los campos del directorio sin
 * tocar un semestre editado por el estudiante.
 */
export class SyncStudentProfileFromDirectory {
  constructor(
    private readonly dependencies: {
      readonly profiles: StudentProfileRepositoryPort;
      readonly clock: ClockPort;
      readonly bounds: SemesterBounds;
    }
  ) {}

  async execute(record: DirectoryRecord): Promise<StudentProfile> {
    const { profiles, clock, bounds } = this.dependencies;
    const email = normalizeEmail(record.email);

    const saved = await saveWithRetry(profiles, email, (current) =>
      current === null
        ? StudentProfile.fromDirectory(record, bounds, clock.now())
        : current.syncedWith(record, bounds, clock.now())
    );
    // `apply` nunca devuelve null aqui, asi que el unico fallo posible es el conflicto.
    if (typeof saved === 'string') throw new ProfileSyncConflictError(email);
    return saved;
  }
}
