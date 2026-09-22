import type { StudentSegment } from '../../value-objects/StudentSegment.js';

/**
 * Fuente del segmento vigente del estudiante (HU-37): el perfil persistido,
 * con el semestre editado, y no la proyeccion del directorio del login.
 */
export interface StudentSegmentPort {
  findByStudent(email: string): Promise<StudentSegment | null>;
}
