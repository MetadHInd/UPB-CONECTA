import { StudentProfile } from '../../../../domain/entities/StudentProfile.js';
import type { StudentProfileRepositoryPort } from '../../../../domain/ports/out/StudentProfileRepositoryPort.js';

export class InMemoryStudentProfileRepository implements StudentProfileRepositoryPort {
  private readonly profiles = new Map<string, StudentProfile>();

  async findByEmail(email: string): Promise<StudentProfile | null> {
    return this.profiles.get(email) ?? null;
  }

  async save(profile: StudentProfile): Promise<boolean> {
    const email = profile.directory.email;
    const stored = this.profiles.get(email);
    const storedVersion = stored?.version ?? 0;
    if (storedVersion !== profile.version) return false;

    this.profiles.set(
      email,
      StudentProfile.restore({
        email,
        programId: profile.directory.programId,
        semester: profile.semester,
        semesterSource: profile.semesterSource,
        updatedAt: profile.updatedAt,
        version: storedVersion + 1
      })
    );
    return true;
  }
}
