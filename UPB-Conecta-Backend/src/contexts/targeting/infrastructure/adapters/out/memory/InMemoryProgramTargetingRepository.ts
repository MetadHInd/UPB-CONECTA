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

  async findByMessageIds(messageIds: readonly string[]): Promise<ReadonlyMap<string, ProgramTargetingRecord>> {
    const result = new Map<string, ProgramTargetingRecord>();
    for (const messageId of messageIds) {
      const entry = this.entries.get(messageId);
      if (entry) result.set(messageId, { ...entry, targeting: structuredClone(entry.targeting) });
    }
    return result;
  }
}
