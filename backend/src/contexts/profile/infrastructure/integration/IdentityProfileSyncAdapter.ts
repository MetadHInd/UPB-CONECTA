import type { IdentityProfile } from '../../../identity/domain/entities/IdentityProfile.js';
import type { AuthenticatedProfileSyncPort } from '../../../identity/domain/ports/out/AuthenticatedProfileSyncPort.js';
import type { SyncStudentProfileFromDirectory } from '../../application/SyncStudentProfileFromDirectory.js';

/**
 * Conecta el puerto de salida de `identity` con el caso de uso de `profile`.
 * Copia campo a campo: `studentId` y cualquier dato futuro del directorio no
 * cruzan al perfil (HU-37 criterio 6).
 */
export class IdentityProfileSyncAdapter implements AuthenticatedProfileSyncPort {
  constructor(private readonly sync: SyncStudentProfileFromDirectory) {}

  async syncFromDirectory(profile: IdentityProfile): Promise<void> {
    await this.sync.execute({
      name: profile.name,
      email: profile.email,
      program: profile.program,
      semester: profile.semester
    });
  }
}
