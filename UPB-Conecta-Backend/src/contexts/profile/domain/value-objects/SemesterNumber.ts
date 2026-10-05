/**
 * Rango admitido de semestres (HU-37 criterio 5). El minimo es siempre 1; el
 * maximo llega desde configuracion (`PROFILE_SEMESTER_MAX`) porque depende de
 * la oferta academica, no de una regla del codigo.
 */
export interface SemesterBounds {
  readonly min: number;
  readonly max: number;
}

export class InvalidSemesterBoundsError extends Error {
  constructor(max: number) {
    super(`El semestre maximo admitido debe ser un entero positivo, se recibio ${max}.`);
    this.name = 'InvalidSemesterBoundsError';
  }
}

export function createSemesterBounds(max: number): SemesterBounds {
  if (!Number.isInteger(max) || max < 1) throw new InvalidSemesterBoundsError(max);
  return Object.freeze({ min: 1, max });
}

export class SemesterOutOfRangeError extends Error {
  constructor(readonly bounds: SemesterBounds) {
    super(`El semestre debe ser un número entero entre ${bounds.min} y ${bounds.max}.`);
    this.name = 'SemesterOutOfRangeError';
  }
}

export class SemesterNumber {
  private constructor(readonly value: number) {
    Object.freeze(this);
  }

  /**
   * Recibe `unknown` a proposito: el valor llega del cliente y se valida en el
   * servidor. Un "6" en texto no es un semestre valido.
   */
  static create(value: unknown, bounds: SemesterBounds): SemesterNumber {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < bounds.min || value > bounds.max) {
      throw new SemesterOutOfRangeError(bounds);
    }
    return new SemesterNumber(value);
  }

  /**
   * El directorio es externo: si reporta un semestre fuera de rango no se
   * bloquea el inicio de sesion, el semestre queda desconocido.
   */
  static fromDirectory(value: unknown, bounds: SemesterBounds): SemesterNumber | null {
    try {
      return SemesterNumber.create(value, bounds);
    } catch {
      return null;
    }
  }

  toJSON(): number {
    return this.value;
  }
}
