/**
 * Filtro de semestre de una convocatoria (HU-37), ortogonal a
 * `ProgramTargeting`: una convocatoria se dirige a un conjunto de programas Y,
 * opcionalmente, a un rango de semestres dentro de ellos. `max: null` significa
 * "en adelante" (p. ej. electivas de 6° semestre en adelante).
 */
export interface SemesterRange {
  readonly min: number;
  readonly max: number | null;
}

export class InvalidSemesterRangeError extends Error {
  constructor(motivo: string) {
    super(`Rango de semestres invalido: ${motivo}`);
    this.name = 'InvalidSemesterRangeError';
  }
}

export function semesterRange(min: number, max: number | null = null): SemesterRange {
  if (!Number.isInteger(min) || min < 1) throw new InvalidSemesterRangeError('el minimo debe ser un entero mayor o igual a 1');
  if (max !== null && (!Number.isInteger(max) || max < min)) {
    throw new InvalidSemesterRangeError('el maximo debe ser un entero mayor o igual al minimo');
  }
  return { min, max };
}

export function semesterRangeIncludes(range: SemesterRange, semester: number): boolean {
  return semester >= range.min && (range.max === null || semester <= range.max);
}
