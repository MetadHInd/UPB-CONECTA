import type { ProgramTargeting } from '../../../targeting/domain/value-objects/ProgramTargeting.js';
import type { IdentityProfile } from '../../../identity/domain/entities/IdentityProfile.js';
import { FacultyProgramResolver } from '../../../targeting/domain/services/FacultyProgramResolver.js';

export class FeedVisibilityPolicy {
  constructor(private readonly facultyResolver: FacultyProgramResolver) {}

  isVisible(targeting: ProgramTargeting, profile: IdentityProfile): boolean {
    switch (targeting.kind) {
      case 'all-community':
        return true;
      case 'faculty':
        if (!profile.program) return false;
        // resolve faculty -> program list and check membership
        return this.facultyResolver.resolveFacultyPrograms(targeting.facultyId).includes(profile.program);
      case 'programs':
        if (!profile.program) return false;
        return targeting.programIds.includes(profile.program);
      default:
        return false;
    }
  }
}
