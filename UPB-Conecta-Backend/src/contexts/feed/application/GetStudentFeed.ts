import type { StudentSegmentPort } from '../domain/ports/out/StudentSegmentPort.js';
import type { GetSegmentedFeed } from './GetSegmentedFeed.js';

/**
 * Feed del estudiante autenticado (HU-37 criterios 3 y 4). Toma el segmento
 * del perfil persistido en cada llamada, de modo que un semestre editado
 * aplica en la siguiente sincronizacion del feed sin volver a iniciar sesion.
 * Sin perfil, el estudiante solo ve contenido para toda la comunidad.
 */
export class GetStudentFeed {
  constructor(
    private readonly dependencies: {
      readonly segments: StudentSegmentPort;
      readonly feed: GetSegmentedFeed;
    }
  ) {}

  async execute(studentEmail: string, limit?: number) {
    const segment = (await this.dependencies.segments.findByStudent(studentEmail)) ?? {};
    return this.dependencies.feed.execute(segment, limit);
  }
}
