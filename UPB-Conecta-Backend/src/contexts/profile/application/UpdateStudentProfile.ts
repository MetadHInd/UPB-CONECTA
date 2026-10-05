import {
  classifyProfileChanges,
  DIRECTORY_CORRECTION_NOTICE,
  normalizeEmail
} from '../domain/entities/StudentProfile.js';
import type { EditableProfileView } from '../domain/entities/StudentProfileView.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { StudentProfileRepositoryPort } from '../domain/ports/out/StudentProfileRepositoryPort.js';
import { SemesterNumber, SemesterOutOfRangeError, type SemesterBounds } from '../domain/value-objects/SemesterNumber.js';
import { saveWithRetry } from './saveWithRetry.js';

export enum ProfileUpdateFailureKind {
  READ_ONLY_FIELD = 'read-only-field',
  UNKNOWN_FIELD = 'unknown-field',
  NO_CHANGES = 'no-changes',
  SEMESTER_OUT_OF_RANGE = 'semester-out-of-range',
  PROFILE_NOT_FOUND = 'profile-not-found',
  CONCURRENT_MODIFICATION = 'concurrent-modification'
}

export interface UpdateStudentProfileInput {
  /** Sujeto de la sesion verificada (HU-45), nunca un valor enviado por el cliente. */
  readonly email: string;
  /** Cuerpo sin tipo de la peticion: la validacion es del servidor. */
  readonly changes: Readonly<Record<string, unknown>>;
}

export type UpdateStudentProfileResult =
  | { readonly ok: true; readonly editable: EditableProfileView }
  | {
      readonly ok: false;
      readonly error: ProfileUpdateFailureKind;
      readonly message: string;
      readonly fields?: readonly string[];
      readonly allowedRange?: SemesterBounds;
    };

/**
 * Actualizacion del perfil por el estudiante (HU-37 criterios 2, 3 y 5). Solo
 * el semestre es escribible; cualquier campo del directorio rechaza la
 * peticion completa con el aviso de que su correccion se tramita ante la
 * Universidad.
 */
export class UpdateStudentProfile {
  constructor(
    private readonly dependencies: {
      readonly profiles: StudentProfileRepositoryPort;
      readonly clock: ClockPort;
      readonly bounds: SemesterBounds;
    }
  ) {}

  async execute(input: UpdateStudentProfileInput): Promise<UpdateStudentProfileResult> {
    const { profiles, clock, bounds } = this.dependencies;
    const changes = classifyProfileChanges(input.changes);

    if (changes.readOnly.length > 0) {
      return {
        ok: false,
        error: ProfileUpdateFailureKind.READ_ONLY_FIELD,
        message: DIRECTORY_CORRECTION_NOTICE,
        fields: changes.readOnly
      };
    }
    if (changes.unknown.length > 0) {
      return {
        ok: false,
        error: ProfileUpdateFailureKind.UNKNOWN_FIELD,
        message: 'El perfil no tiene esos campos.',
        fields: changes.unknown
      };
    }
    if (!changes.semester.present) {
      return { ok: false, error: ProfileUpdateFailureKind.NO_CHANGES, message: 'No se indicó ningún cambio.' };
    }

    let semester: SemesterNumber;
    try {
      semester = SemesterNumber.create(changes.semester.value, bounds);
    } catch (error) {
      if (!(error instanceof SemesterOutOfRangeError)) throw error;
      return {
        ok: false,
        error: ProfileUpdateFailureKind.SEMESTER_OUT_OF_RANGE,
        message: error.message,
        allowedRange: error.bounds
      };
    }

    const saved = await saveWithRetry(profiles, normalizeEmail(input.email), (current) =>
      current === null ? null : current.withSemester(semester, clock.now())
    );
    if (saved === 'not-found') {
      return {
        ok: false,
        error: ProfileUpdateFailureKind.PROFILE_NOT_FOUND,
        message: 'El perfil aún no existe: inicie sesión para sincronizarlo con el directorio.'
      };
    }
    if (saved === 'conflict') {
      return {
        ok: false,
        error: ProfileUpdateFailureKind.CONCURRENT_MODIFICATION,
        message: 'El perfil cambió mientras se guardaba. Intente de nuevo.'
      };
    }

    return {
      ok: true,
      editable: { semester: semester.value, semesterSource: saved.semesterSource, allowedRange: bounds }
    };
  }
}
