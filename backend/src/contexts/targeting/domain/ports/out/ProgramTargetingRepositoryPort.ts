import type { ProgramTargeting } from '../../value-objects/ProgramTargeting.js';
import type { SemesterRange } from '../../value-objects/SemesterRange.js';

export interface ProgramTargetingRecord {
  readonly messageId: string;
  readonly targeting: ProgramTargeting;
  /** HU-37: filtro de semestre ortogonal al programa. Ausente o `null` = sin restriccion. */
  readonly semesterRange?: SemesterRange | null;
  readonly persistedAt: Date;
}

export interface ProgramTargetingRepositoryPort {
  save(record: ProgramTargetingRecord): Promise<void>;
  findByMessageId(messageId: string): Promise<ProgramTargetingRecord | null>;
}
