import type { InstitutionalMessage } from '../../../ingestion/domain/entities/InstitutionalMessage.js';
import type { InstitutionalProgramCatalog } from '../ports/out/ProgramCatalogPort.js';
import {
  allCommunityTargeting,
  facultyTargeting,
  programTargeting,
  type ProgramTargeting
} from '../value-objects/ProgramTargeting.js';
import { normalizeCatalogText as normalizeText } from './CatalogTextNormalization.js';

export class ProgramTargetingResolver {
  constructor(private readonly catalog: InstitutionalProgramCatalog) {}

  resolveFromMessage(message: InstitutionalMessage): ProgramTargeting {
    const haystack = normalizeText(`${message.subject} ${message.body}`);

    const explicitProgramIds = this.catalog.programs
      .filter((program) => {
        const programTokens = [program.name, program.id];
        return programTokens.some((token) => haystack.includes(normalizeText(token)));
      })
      .map((program) => program.id);

    if (explicitProgramIds.length > 0) {
      return programTargeting(explicitProgramIds);
    }

    const facultyMatches = this.catalog.faculties.filter((faculty) => {
      return [faculty.name, faculty.id].some((token) => haystack.includes(normalizeText(token)));
    });

    const facultyMatch = facultyMatches[0];
    if (facultyMatch) {
      return facultyTargeting(facultyMatch.id);
    }

    return allCommunityTargeting();
  }
}
