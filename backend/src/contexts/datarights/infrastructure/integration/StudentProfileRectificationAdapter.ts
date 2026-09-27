import type { UpdateStudentProfile } from '../../../profile/application/UpdateStudentProfile.js';
import { ProfileUpdateFailureKind } from '../../../profile/application/UpdateStudentProfile.js';
import type { StudentProfileRepositoryPort } from '../../../profile/domain/ports/out/StudentProfileRepositoryPort.js';
import type { ProfileRectificationOutcome, ProfileRectificationPort } from '../../domain/ports/out/ProfileRectificationPort.js';

/**
 * Conecta la rectificacion con `UpdateStudentProfile` (HU-37): la frontera
 * solo lectura / editable sigue siendo de `profile`; este adaptador solo
 * traduce su resultado y captura el valor anterior para el registro con fecha.
 */
export class StudentProfileRectificationAdapter implements ProfileRectificationPort {
  constructor(
    private readonly dependencies: {
      readonly profiles: StudentProfileRepositoryPort;
      readonly update: UpdateStudentProfile;
    }
  ) {}

  async rectify(subject: string, changes: Readonly<Record<string, unknown>>): Promise<ProfileRectificationOutcome> {
    const { profiles, update } = this.dependencies;
    const before = await profiles.findByEmail(subject);
    const result = await update.execute({ email: subject, changes });

    if (result.ok) {
      return {
        kind: 'applied',
        changes: [{ field: 'semester', previousValue: before?.semester?.value ?? null, newValue: result.editable.semester }]
      };
    }
    if (result.error === ProfileUpdateFailureKind.READ_ONLY_FIELD) {
      return { kind: 'directory-provided', fields: result.fields ?? [] };
    }
    return { kind: 'rejected', message: result.message, ...(result.fields === undefined ? {} : { fields: result.fields }) };
  }
}
