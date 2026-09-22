import { SemesterNumber, type SemesterBounds } from '../value-objects/SemesterNumber.js';

/**
 * Datos del estudiante tal como llegan del directorio institucional en una
 * autenticacion (HU-43). Es estructuralmente compatible con `IdentityProfile`
 * sin importarlo: este contexto no depende de `identity`.
 */
export interface DirectoryRecord {
  readonly name: string;
  readonly email: string;
  readonly program: string;
  readonly semester: number;
}

/**
 * Lo que el perfil conserva del directorio. Solo lectura: ninguna operacion de
 * esta entidad permite que el estudiante lo cambie (HU-37 criterio 2), y solo
 * contiene lo estrictamente necesario para identificar y segmentar (criterio 6):
 * el nombre y el codigo estudiantil no se guardan.
 */
export interface DirectoryProjection {
  readonly email: string;
  readonly program: string;
}

/** `directory` hasta que el estudiante edita; desde entonces `student`. */
export type SemesterSource = 'directory' | 'student';

/** Campos que el directorio provee y que el estudiante nunca puede escribir. */
export const DIRECTORY_FIELDS = ['name', 'email', 'program', 'studentId'] as const;

/** Unico campo que el estudiante puede escribir. */
export const EDITABLE_FIELDS = ['semester'] as const;

export const DIRECTORY_CORRECTION_NOTICE =
  'Estos datos provienen del directorio institucional y son de solo lectura. Su corrección se tramita ante la Universidad.';

export interface ProfileChangeClassification {
  readonly readOnly: readonly string[];
  readonly unknown: readonly string[];
  readonly semester: { readonly present: true; readonly value: unknown } | { readonly present: false };
}

/**
 * Regla de dominio de la frontera solo lectura / editable para cambios que
 * llegan sin tipo (el cuerpo JSON de una peticion futura). El tipo de la
 * entidad ya impide escribir campos del directorio en compilacion; esta
 * funcion cubre lo que el compilador no ve.
 */
export function classifyProfileChanges(changes: Readonly<Record<string, unknown>>): ProfileChangeClassification {
  const keys = Object.keys(changes);
  const directoryFields: readonly string[] = DIRECTORY_FIELDS;
  const editableFields: readonly string[] = EDITABLE_FIELDS;
  return {
    readOnly: keys.filter((key) => directoryFields.includes(key)),
    unknown: keys.filter((key) => !directoryFields.includes(key) && !editableFields.includes(key)),
    semester: 'semester' in changes ? { present: true, value: changes['semester'] } : { present: false }
  };
}

export interface StudentSegmentation {
  readonly program: string;
  readonly semester?: number;
}

/**
 * Perfil del estudiante (HU-37): proyeccion del directorio (solo lectura) mas
 * el semestre editable. Inmutable: toda operacion devuelve un perfil nuevo.
 * `version` es el control de concurrencia optimista (0 = aun no persistido).
 */
export class StudentProfile {
  private constructor(
    readonly directory: DirectoryProjection,
    readonly semester: SemesterNumber | null,
    readonly semesterSource: SemesterSource,
    readonly updatedAt: Date,
    readonly version: number
  ) {
    Object.freeze(this);
  }

  static fromDirectory(record: DirectoryRecord, bounds: SemesterBounds, at: Date): StudentProfile {
    return new StudentProfile(project(record), SemesterNumber.fromDirectory(record.semester, bounds), 'directory', at, 0);
  }

  static restore(props: {
    readonly email: string;
    readonly program: string;
    readonly semester: SemesterNumber | null;
    readonly semesterSource: SemesterSource;
    readonly updatedAt: Date;
    readonly version: number;
  }): StudentProfile {
    return new StudentProfile(
      Object.freeze({ email: props.email, program: props.program }),
      props.semester,
      props.semesterSource,
      props.updatedAt,
      props.version
    );
  }

  /**
   * Refresca la proyeccion con lo que trae el directorio. El semestre solo se
   * toma del directorio si el estudiante nunca lo edito.
   */
  syncedWith(record: DirectoryRecord, bounds: SemesterBounds, at: Date): StudentProfile {
    const semester =
      this.semesterSource === 'student' ? this.semester : SemesterNumber.fromDirectory(record.semester, bounds);
    return new StudentProfile(project(record), semester, this.semesterSource, at, this.version);
  }

  withSemester(semester: SemesterNumber, at: Date): StudentProfile {
    return new StudentProfile(this.directory, semester, 'student', at, this.version);
  }

  segment(): StudentSegmentation {
    return this.semester === null
      ? { program: this.directory.program }
      : { program: this.directory.program, semester: this.semester.value };
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function project(record: DirectoryRecord): DirectoryProjection {
  // Copia campo a campo, nunca `...record`: lo que el directorio agregue en el
  // futuro no se replica en el perfil sin una decision explicita.
  return Object.freeze({ email: normalizeEmail(record.email), program: record.program });
}
