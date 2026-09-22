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
 *
 * `programId` es el id del catalogo institucional, no el texto que entrega el
 * directorio (correccion del bug 3): es la misma clave con la que el targeting
 * dirige las convocatorias. `null` = el directorio entrego un programa que el
 * catalogo no reconoce; el estudiante solo ve contenido de toda la comunidad.
 */
export interface DirectoryProjection {
  readonly email: string;
  readonly programId: string | null;
}

/** `directory` hasta que el estudiante edita; desde entonces `student`. */
export type SemesterSource = 'directory' | 'student';

/** Campos que el directorio provee y que el estudiante nunca puede escribir. */
export const DIRECTORY_FIELDS = ['name', 'email', 'program', 'programId', 'studentId'] as const;

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
  readonly program?: string;
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

  /** `programId`: el programa del directorio ya traducido al catalogo (ver `ProgramCatalogPort`). */
  static fromDirectory(record: DirectoryRecord, programId: string | null, bounds: SemesterBounds, at: Date): StudentProfile {
    return new StudentProfile(
      project(record, programId),
      SemesterNumber.fromDirectory(record.semester, bounds),
      'directory',
      at,
      0
    );
  }

  static restore(props: {
    readonly email: string;
    readonly programId: string | null;
    readonly semester: SemesterNumber | null;
    readonly semesterSource: SemesterSource;
    readonly updatedAt: Date;
    readonly version: number;
  }): StudentProfile {
    return new StudentProfile(
      Object.freeze({ email: props.email, programId: props.programId }),
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
  syncedWith(record: DirectoryRecord, programId: string | null, bounds: SemesterBounds, at: Date): StudentProfile {
    const semester =
      this.semesterSource === 'student' ? this.semester : SemesterNumber.fromDirectory(record.semester, bounds);
    return new StudentProfile(project(record, programId), semester, this.semesterSource, at, this.version);
  }

  withSemester(semester: SemesterNumber, at: Date): StudentProfile {
    return new StudentProfile(this.directory, semester, 'student', at, this.version);
  }

  /** Sin programa reconocido, el segmento no lleva programa: el feed lo trata como perfil incompleto. */
  segment(): StudentSegmentation {
    return {
      ...(this.directory.programId === null ? {} : { program: this.directory.programId }),
      ...(this.semester === null ? {} : { semester: this.semester.value })
    };
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function project(record: DirectoryRecord, programId: string | null): DirectoryProjection {
  // Copia campo a campo, nunca `...record`: lo que el directorio agregue en el
  // futuro no se replica en el perfil sin una decision explicita. El texto del
  // programa tampoco se guarda: solo su id del catalogo.
  return Object.freeze({ email: normalizeEmail(record.email), programId });
}
