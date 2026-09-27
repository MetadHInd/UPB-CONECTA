import type { KnowledgeEntry } from '../../../domain/entities/KnowledgeEntry.js';
import type { KnowledgeBasePort, KnowledgeSource } from '../../../domain/ports/out/KnowledgeBasePort.js';
import type { KnowledgeEntryRepositoryPort } from '../../../domain/ports/out/KnowledgeEntryRepositoryPort.js';
import { rankKnowledgeEntries } from '../../../domain/services/KnowledgeSearch.js';

const DEFAULT_LIMIT = 5;

function toSource(entry: KnowledgeEntry): KnowledgeSource {
  return { id: entry.id, title: entry.title, content: entry.content, category: entry.category, version: entry.version, updatedAt: entry.updatedAt };
}

/**
 * `KnowledgeBasePort` sobre el mismo repositorio que administra el panel
 * (HU-41). Solo lee entradas vigentes y no guarda cache ni indice: lo que el
 * administrador publica o retira se refleja en la siguiente pregunta.
 * `defaultLimit` viene de `config/knowledge-base.json`.
 */
export class RepositoryKnowledgeBase implements KnowledgeBasePort {
  constructor(
    private readonly entries: KnowledgeEntryRepositoryPort,
    private readonly defaultLimit: number = DEFAULT_LIMIT
  ) {}

  async search(query: string, options: { readonly limit?: number } = {}): Promise<readonly KnowledgeSource[]> {
    const active = await this.entries.findActive();
    return rankKnowledgeEntries(active, query, options.limit ?? this.defaultLimit).map(toSource);
  }

  async findById(id: string): Promise<KnowledgeSource | null> {
    const entry = await this.entries.findById(id);
    return entry !== null && entry.withdrawnAt === null ? toSource(entry) : null;
  }
}
