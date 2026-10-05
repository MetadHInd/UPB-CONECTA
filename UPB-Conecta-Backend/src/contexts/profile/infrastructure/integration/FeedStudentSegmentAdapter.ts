import type { StudentSegmentPort } from '../../../feed/domain/ports/out/StudentSegmentPort.js';
import type { StudentSegment } from '../../../feed/domain/value-objects/StudentSegment.js';
import { normalizeEmail } from '../../domain/entities/StudentProfile.js';
import type { StudentProfileRepositoryPort } from '../../domain/ports/out/StudentProfileRepositoryPort.js';

/** Entrega al feed el segmento del perfil persistido, con el semestre editado. */
export class FeedStudentSegmentAdapter implements StudentSegmentPort {
  constructor(private readonly profiles: StudentProfileRepositoryPort) {}

  async findByStudent(email: string): Promise<StudentSegment | null> {
    const profile = await this.profiles.findByEmail(normalizeEmail(email));
    return profile === null ? null : profile.segment();
  }
}
