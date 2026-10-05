import type { ProgramTargeting } from '../value-objects/ProgramTargeting.js';
import type { FacultyProgramResolver } from './FacultyProgramResolver.js';

/**
 * ¿Un programa (id del catalogo) entra en un `ProgramTargeting`? Unica
 * definicion de "uno, varios o todos" para quien segmente por programa: el
 * feed (HU-12) y los temas restringidos del foro (HU-30). Sin programa
 * conocido solo entra en `all-community`.
 */
export function targetingIncludesProgram(
  targeting: ProgramTargeting,
  programId: string | null | undefined,
  faculties: FacultyProgramResolver
): boolean {
  switch (targeting.kind) {
    case 'all-community':
      return true;
    case 'faculty':
      if (!programId) return false;
      return faculties.resolveFacultyPrograms(targeting.facultyId).includes(programId);
    case 'programs':
      if (!programId) return false;
      return targeting.programIds.includes(programId);
    default:
      return false;
  }
}
