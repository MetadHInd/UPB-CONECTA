import type { ConvocatoriaRepositoryPort } from '../domain/ports/out/ConvocatoriaRepositoryPort.js';
import type { StudentSegment } from '../domain/value-objects/StudentSegment.js';
import type { ProgramTargetingRepositoryPort } from '../../targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';
import type { ClassificationResultRepositoryPort } from '../../classification/domain/ports/out/ClassificationResultRepositoryPort.js';
import { FeedVisibilityPolicy } from '../domain/services/FeedVisibilityPolicy.js';
import { allCommunityTargeting } from '../../targeting/domain/value-objects/ProgramTargeting.js';
import { FacultyProgramResolver } from '../../targeting/domain/services/FacultyProgramResolver.js';

export class GetSegmentedFeed {
  constructor(
    private readonly deps: {
      readonly convocatoriaRepo: ConvocatoriaRepositoryPort;
      readonly programTargetingRepo: ProgramTargetingRepositoryPort;
      readonly facultyResolver: FacultyProgramResolver;
      /**
       * HU-10 (gap 1): si se provee, una convocatoria cuyo mensaje
       * representativo quedo en revision pendiente se excluye del feed. Sin
       * registro de clasificacion se considera visible (mismo criterio
       * permisivo que ya se usa aqui para un targeting ausente).
       */
      readonly classificationResultRepo?: ClassificationResultRepositoryPort;
    }
  ) {}

  async execute(profile: StudentSegment, limit?: number) {
    const entries = await this.deps.convocatoriaRepo.findSegmentedFeed(profile, typeof limit === 'undefined' ? undefined : { limit });
    const policy = new FeedVisibilityPolicy(this.deps.facultyResolver);

    const visible: typeof entries = [];
    for (const entry of entries) {
      const repMessageId = entry.record.representativeMessageId;
      if (!repMessageId) continue; // cannot resolve targeting without messageId

      if (await this.isPendingReview(repMessageId)) continue;

      const targetingRecord = await this.deps.programTargetingRepo.findByMessageId(repMessageId);
      const targeting = targetingRecord ? targetingRecord.targeting : allCommunityTargeting();

      if (policy.isVisible(targeting, profile, targetingRecord?.semesterRange ?? null)) {
        visible.push(entry);
      }
    }

    // If profile.program is missing, signal incomplete profile along with feed.
    const incompleteProfile = !profile.program;
    return { feed: visible, incompleteProfile };
  }

  private async isPendingReview(messageId: string): Promise<boolean> {
    if (!this.deps.classificationResultRepo) return false;
    const classification = await this.deps.classificationResultRepo.findByMessageId(messageId);
    return classification?.publicationStatus === 'pending-review';
  }
}
