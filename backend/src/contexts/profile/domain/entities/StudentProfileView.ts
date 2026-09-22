import type { SemesterBounds } from '../value-objects/SemesterNumber.js';
import type { SemesterSource } from './StudentProfile.js';

/**
 * Lo que el estudiante ve al abrir su perfil (HU-37 criterio 1). La separacion
 * entre `readOnly` y `editable` la decide el dominio: la interfaz no elige que
 * campos mostrar como editables.
 */
export interface StudentProfileView {
  readonly readOnly: {
    readonly name: string;
    readonly email: string;
    readonly program: string;
    readonly directorySemester: number;
    readonly correctionNotice: string;
  };
  readonly editable: EditableProfileView;
}

export interface EditableProfileView {
  readonly semester: number | null;
  readonly semesterSource: SemesterSource;
  readonly allowedRange: SemesterBounds;
}
