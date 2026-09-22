import type { ProgramTargeting } from '../../../targeting/domain/value-objects/ProgramTargeting.js';
import {
  semesterRangeIncludes,
  type SemesterRange
} from '../../../targeting/domain/value-objects/SemesterRange.js';
import { FacultyProgramResolver } from '../../../targeting/domain/services/FacultyProgramResolver.js';
import type { StudentSegment } from '../value-objects/StudentSegment.js';

export class FeedVisibilityPolicy {
  constructor(private readonly facultyResolver: FacultyProgramResolver) {}

  /**
   * Visible si el programa del estudiante esta en el targeting Y, cuando la
   * convocatoria restringe semestres (HU-37), su semestre cae en el rango. Un
   * estudiante sin semestre conocido no ve contenido dirigido por semestre.
   */
  isVisible(targeting: ProgramTargeting, student: StudentSegment, semesters: SemesterRange | null = null): boolean {
    return this.matchesProgram(targeting, student) && this.matchesSemester(semesters, student);
  }

  private matchesSemester(semesters: SemesterRange | null, student: StudentSegment): boolean {
    if (semesters === null) return true;
    if (student.semester === undefined) return false;
    return semesterRangeIncludes(semesters, student.semester);
  }

  private matchesProgram(targeting: ProgramTargeting, student: StudentSegment): boolean {
    switch (targeting.kind) {
      case 'all-community':
        return true;
      case 'faculty':
        if (!student.program) return false;
        // resolve faculty -> program list and check membership
        return this.facultyResolver.resolveFacultyPrograms(targeting.facultyId).includes(student.program);
      case 'programs':
        if (!student.program) return false;
        return targeting.programIds.includes(student.program);
      default:
        return false;
    }
  }
}
