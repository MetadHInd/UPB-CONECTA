import type { StudentProfile } from '../../entities/StudentProfile.js';

export interface StudentProfileRepositoryPort {
  /** `email` ya normalizado. */
  findByEmail(email: string): Promise<StudentProfile | null>;

  /**
   * Guardado con concurrencia optimista: inserta si `profile.version === 0` y
   * el perfil no existe; si no, actualiza solo si la version almacenada sigue
   * siendo `profile.version`. Devuelve `false` ante un conflicto, sin escribir.
   * Asi un login que sincroniza no pisa un semestre editado a la vez.
   */
  save(profile: StudentProfile): Promise<boolean>;
}
