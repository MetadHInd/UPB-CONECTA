import type { KnowledgeEntry } from '../../../../domain/entities/KnowledgeEntry.js';
import type { KnowledgeBasePort } from '../../../../domain/ports/out/KnowledgeBasePort.js';
import type { ClockPort } from '../../../../domain/ports/out/ClockPort.js';
import { normalizeText } from '../../../../domain/services/OutOfScopeDetector.js';

/** Doble en memoria del `KnowledgeBasePort` minimo de HU-42; HU-41 aporta el real. */
export class InMemoryKnowledgeBase implements KnowledgeBasePort {
  private readonly entries = new Map<string, KnowledgeEntry>();

  constructor(private readonly clock: ClockPort, seed: readonly KnowledgeEntry[] = []) {
    for (const entry of seed) this.entries.set(entry.id, entry);
  }

  async searchCurrent(query: string): Promise<KnowledgeEntry[]> {
    const now = this.clock.now().getTime();
    const tokens = normalizeText(query)
      .split(' ')
      .filter((token) => token.length >= 4);
    return [...this.entries.values()].filter((entry) => {
      if (entry.validUntil !== null && entry.validUntil.getTime() <= now) return false;
      const haystack = normalizeText(`${entry.title} ${entry.content}`);
      return tokens.some((token) => haystack.includes(token));
    });
  }

  async findById(id: string): Promise<KnowledgeEntry | null> {
    return this.entries.get(id) ?? null;
  }
}
