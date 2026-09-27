import type { KnowledgeEntry } from '../../../../domain/entities/KnowledgeEntry.js';
import type { KnowledgeEntryRepositoryPort } from '../../../../domain/ports/out/KnowledgeEntryRepositoryPort.js';

export class InMemoryKnowledgeEntryRepository implements KnowledgeEntryRepositoryPort {
  private readonly entries = new Map<string, KnowledgeEntry>();

  async findById(id: string): Promise<KnowledgeEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async findAll(): Promise<readonly KnowledgeEntry[]> {
    return [...this.entries.values()];
  }

  async findActive(): Promise<readonly KnowledgeEntry[]> {
    return [...this.entries.values()].filter((entry) => entry.withdrawnAt === null);
  }

  async save(entry: KnowledgeEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }
}
