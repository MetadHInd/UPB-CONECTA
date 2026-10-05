import type { ProgramTargeting } from '../../../targeting/domain/value-objects/ProgramTargeting.js';
import {
  semesterRangeIncludes,
  type SemesterRange
} from '../../../targeting/domain/value-objects/SemesterRange.js';
import { FacultyProgramResolver } from '../../../targeting/domain/services/FacultyProgramResolver.js';
import { targetingIncludesProgram } from '../../../targeting/domain/services/ProgramTargetingMembership.js';
import type { StudentSegment } from '../value-objects/StudentSegment.js';

export class FeedVisibilityPolicy {
  constructor(private readonly facultyResolver: FacultyProgramResolver) {}

  /**
   * Visible si el programa del estudiante esta en el targeting Y, cuando la
   * convocatoria restringe semestres (HU-37), su semestre cae en el rango. Un
   * estudiante sin semestre conocido no ve contenido dirigido por semestre.
   */
  isVisible(targeting: ProgramTargeting, student: StudentSegment, semesters: SemesterRange | null = null): boolean {
    return (
      targetingIncludesProgram(targeting, student.program, this.facultyResolver) && this.matchesSemester(semesters, student)
    );
  }

  private matchesSemester(semesters: SemesterRange | null, student: StudentSegment): boolean {
    if (semesters === null) return true;
    if (student.semester === undefined) return false;
    return semesterRangeIncludes(semesters, student.semester);
  }
}
