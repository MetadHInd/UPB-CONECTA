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

  /**
   * Todos los perfiles conocidos. Agregado de forma aditiva para HU-19/HU-20
   * (planificador de avisos, contexto `notifications`): resolver a quien
   * pertenece un programa objetivo exige poder listar estudiantes, algo que
   * `profile` no necesitaba antes de que existiera un consumidor que
   * cruzara targeting con perfiles. Ver `StudentDirectoryPort` y
   * `ProfileStudentDirectoryAdapter` en `notifications`.
   */
  findAll(): Promise<readonly StudentProfile[]>;
}
