import type { KnowledgeEntry } from '../domain/entities/KnowledgeEntry.js';
import type { KnowledgeEntryRepositoryPort } from '../domain/ports/out/KnowledgeEntryRepositoryPort.js';

/**
 * Listado del panel de administracion (HU-41 criterio 1): a diferencia de
 * `KnowledgeBasePort`, incluye las retiradas para poder consultarlas.
 */
export class ListKnowledgeEntries {
  constructor(private readonly dependencies: { readonly entries: KnowledgeEntryRepositoryPort }) {}

  async execute(input: { readonly status?: 'active' | 'withdrawn' }): Promise<readonly KnowledgeEntry[]> {
    const all = await this.dependencies.entries.findAll();
    const filtered = input.status === undefined ? all : all.filter((entry) => (entry.withdrawnAt === null) === (input.status === 'active'));
    return [...filtered].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}
