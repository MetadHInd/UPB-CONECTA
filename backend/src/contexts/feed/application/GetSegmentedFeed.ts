import type { ConvocatoriaRepositoryPort } from '../domain/ports/out/ConvocatoriaRepositoryPort.js';
import type { IdentityProfile } from '../../identity/domain/entities/IdentityProfile.js';
import type { ProgramTargetingRepositoryPort } from '../../targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';
import { FeedVisibilityPolicy } from '../domain/services/FeedVisibilityPolicy.js';
import { allCommunityTargeting } from '../../targeting/domain/value-objects/ProgramTargeting.js';
import { FacultyProgramResolver } from '../../targeting/domain/services/FacultyProgramResolver.js';

export class GetSegmentedFeed {
  constructor(
    private readonly deps: {
      readonly convocatoriaRepo: ConvocatoriaRepositoryPort;
      readonly programTargetingRepo: ProgramTargetingRepositoryPort;
      readonly facultyResolver: FacultyProgramResolver;
    }
  ) {}

  async execute(profile: IdentityProfile, limit?: number) {
    const entries = await this.deps.convocatoriaRepo.findSegmentedFeed(profile, typeof limit === 'undefined' ? undefined : { limit });
    const policy = new FeedVisibilityPolicy(this.deps.facultyResolver);

    const visible: typeof entries = [];
    for (const entry of entries) {
      const repMessageId = entry.record.representativeMessageId;
      if (!repMessageId) continue; // cannot resolve targeting without messageId

      const targetingRecord = await this.deps.programTargetingRepo.findByMessageId(repMessageId);
      const targeting = targetingRecord ? targetingRecord.targeting : allCommunityTargeting();

      if (policy.isVisible(targeting, profile)) {
        visible.push(entry);
      }
    }

    // If profile.program is missing, signal incomplete profile along with feed.
    const incompleteProfile = !profile.program;
    return { feed: visible, incompleteProfile };
  }
}
