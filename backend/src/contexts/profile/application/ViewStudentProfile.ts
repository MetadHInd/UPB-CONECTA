import {
  DIRECTORY_CORRECTION_NOTICE,
  normalizeEmail,
  StudentProfile,
  type DirectoryRecord
} from '../domain/entities/StudentProfile.js';
import type { StudentProfileView } from '../domain/entities/StudentProfileView.js';
import type { StudentProfileRepositoryPort } from '../domain/ports/out/StudentProfileRepositoryPort.js';
import type { SemesterBounds } from '../domain/value-objects/SemesterNumber.js';

/**
 * Vista del perfil (HU-37 criterio 1). Recibe los datos frescos del directorio
 * de la autenticacion en curso y les suma el semestre vigente persistido. El
 * nombre sale del directorio y no del almacenamiento, porque el perfil
 * persistido no lo guarda (criterio 6).
 */
export class ViewStudentProfile {
  constructor(
    private readonly dependencies: {
      readonly profiles: StudentProfileRepositoryPort;
      readonly bounds: SemesterBounds;
    }
  ) {}

  async execute(directory: DirectoryRecord): Promise<StudentProfileView> {
    const { profiles, bounds } = this.dependencies;
    const email = normalizeEmail(directory.email);
    const profile =
      (await profiles.findByEmail(email)) ?? StudentProfile.fromDirectory(directory, bounds, new Date(0));

    return {
      readOnly: {
        name: directory.name,
        email,
        program: directory.program,
        directorySemester: directory.semester,
        correctionNotice: DIRECTORY_CORRECTION_NOTICE
      },
      editable: {
        semester: profile.semester?.value ?? null,
        semesterSource: profile.semesterSource,
        allowedRange: bounds
      }
    };
  }
}
