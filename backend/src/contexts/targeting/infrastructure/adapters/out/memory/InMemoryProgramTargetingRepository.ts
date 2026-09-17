import type { ProgramTargetingRecord, ProgramTargetingRepositoryPort } from '../../../../domain/ports/out/ProgramTargetingRepositoryPort.js';

export class InMemoryProgramTargetingRepository implements ProgramTargetingRepositoryPort {
  private readonly entries = new Map<string, ProgramTargetingRecord>();

  async save(record: ProgramTargetingRecord): Promise<void> {
    this.entries.set(record.messageId, record);
  }

  async findByMessageId(messageId: string): Promise<ProgramTargetingRecord | null> {
    const entry = this.entries.get(messageId);
    return entry ? { ...entry, targeting: structuredClone(entry.targeting) } : null;
  }
}
