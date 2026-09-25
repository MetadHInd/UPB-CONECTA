import type { StudentDirectoryEntry, StudentDirectoryPort } from '../../../../domain/ports/out/StudentDirectoryPort.js';
import type { StudentProfileRepositoryPort } from '../../../../../profile/domain/ports/out/StudentProfileRepositoryPort.js';
import type { StudentProfile } from '../../../../../profile/domain/entities/StudentProfile.js';

/**
 * Implementa `StudentDirectoryPort` (declarado por `notifications`) leyendo
 * `profile` — mismo patron que `ConsentStatusAdapter` (`identity`, HU-44):
 * el adaptador vive en la infraestructura del contexto consumidor, nunca en
 * `profile`, y traduce el tipo ajeno (`StudentProfile`) al propio
 * (`StudentDirectoryEntry`) en la frontera.
 *
 * Depende directamente de `StudentProfileRepositoryPort.findAll` (puerto de
 * salida de `profile`, ampliado de forma aditiva para esta historia, igual
 * que `NotificationSchedulingPort` gano `cancelScheduledNotifications` en
 * HU-50) en vez de un caso de uso intermedio de `profile`: la proyeccion que
 * hace falta (`studentId`, `programId`) es un campo a campo directo del
 * perfil, sin ninguna regla de negocio propia de `profile` que envolver.
 */
export class ProfileStudentDirectoryAdapter implements StudentDirectoryPort {
  constructor(private readonly profiles: StudentProfileRepositoryPort) {}

  async findAll(): Promise<readonly StudentDirectoryEntry[]> {
    const all = await this.profiles.findAll();
    return all.map((profile: StudentProfile) => ({
      studentId: profile.directory.email,
      programId: profile.directory.programId
    }));
  }
}
