import type {
  ConsolidatedMessageRecord,
  ConsolidatedMessageRegistryPort
} from '../../../../domain/ports/out/ConsolidatedMessageRegistryPort.js';
import { convocatoriaIdToString, type ConvocatoriaId } from '../../../../domain/value-objects/ConvocatoriaId.js';

export class InMemoryConsolidatedMessageRegistry implements ConsolidatedMessageRegistryPort {
  private readonly groups = new Map<string, ConsolidatedMessageRecord>();

  async findWithinWindow(
    sender: string,
    subject: string,
    referenceDate: Date,
    windowMs: number
  ): Promise<ConsolidatedMessageRecord | null> {
    for (const record of this.groups.values()) {
      if (record.sender !== sender || record.subject !== subject) continue;
      const elapsedMs = referenceDate.getTime() - record.lastSentAt.getTime();
      if (elapsedMs >= 0 && elapsedMs <= windowMs) return record;
    }
    return null;
  }

  async findById(id: ConvocatoriaId): Promise<ConsolidatedMessageRecord | null> {
    return this.groups.get(convocatoriaIdToString(id)) ?? null;
  }

  async findByRepresentativeMessageId(messageId: string): Promise<ConsolidatedMessageRecord | null> {
    for (const record of this.groups.values()) {
      if (record.representativeMessageId === messageId) return record;
    }
    return null;
  }

  async save(record: ConsolidatedMessageRecord): Promise<void> {
    this.groups.set(convocatoriaIdToString(record), record);
  }

  get size(): number {
    return this.groups.size;
  }
}
