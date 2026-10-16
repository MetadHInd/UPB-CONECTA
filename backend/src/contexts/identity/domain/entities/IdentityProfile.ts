export interface IdentityProfile {
  readonly name: string;
  readonly email: string;
  readonly program: string;
  /** Solo estudiantes: un profesor no tiene semestre en el directorio. */
  readonly semester?: number;
  readonly studentId?: string;
}
