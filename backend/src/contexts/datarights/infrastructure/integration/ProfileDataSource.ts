import type { StudentProfileRepositoryPort } from '../../../profile/domain/ports/out/StudentProfileRepositoryPort.js';
import type { PersonalDataRecord } from '../../domain/entities/PersonalDataArea.js';
import type { PersonalDataSourcePort } from '../../domain/ports/out/PersonalDataSourcePort.js';

/**
 * Perfil (HU-37). El perfil persistido guarda solo correo, programa del
 * catalogo y semestre; el nombre y el codigo estudiantil no se guardan
 * (HU-37 criterio 6), asi que no aparecen aqui.
 */
export class ProfileDataSource implements PersonalDataSourcePort {
  readonly area = 'profile' as const;

  constructor(private readonly profiles: StudentProfileRepositoryPort) {}

  async collect(subject: string): Promise<readonly PersonalDataRecord[]> {
    const profile = await this.profiles.findByEmail(subject);
    if (profile === null) return [];
    return [
      {
        email: profile.directory.email,
        programId: profile.directory.programId,
        semester: profile.semester?.value ?? null,
        semesterSource: profile.semesterSource,
        updatedAt: profile.updatedAt
      }
    ];
  }

  async erase(subject: string): Promise<number> {
    return (await this.profiles.delete(subject)) ? 1 : 0;
  }
}
