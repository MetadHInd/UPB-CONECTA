import type { ProgramTargeting } from '../../value-objects/ProgramTargeting.js';

export interface ProgramTargetingRecord {
  readonly messageId: string;
  readonly targeting: ProgramTargeting;
  readonly persistedAt: Date;
}

export interface ProgramTargetingRepositoryPort {
  save(record: ProgramTargetingRecord): Promise<void>;
  findByMessageId(messageId: string): Promise<ProgramTargetingRecord | null>;
}
