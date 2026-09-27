import type { KnowledgeEntryVersion } from '../domain/entities/KnowledgeEntry.js';
import type { KnowledgeAuditEvent, KnowledgeAuditLogPort } from '../domain/ports/out/KnowledgeAuditLogPort.js';
import type { KnowledgeEntryRepositoryPort } from '../domain/ports/out/KnowledgeEntryRepositoryPort.js';
import { entryNotFound, type KnowledgeFailure } from './KnowledgeEntryResults.js';

export interface KnowledgeEntryVersionView {
  readonly version: number;
  readonly title: string;
  readonly content: string;
  readonly category: string;
  readonly keywords: readonly string[];
  /** Cuando dejo de ser la vigente; `null` en la vigente. */
  readonly replacedAt: Date | null;
  readonly replacedBy: string | null;
  readonly current: boolean;
}

export type GetKnowledgeEntryHistoryResult =
  | { readonly ok: true; readonly versions: readonly KnowledgeEntryVersionView[]; readonly audit: readonly KnowledgeAuditEvent[] }
  | KnowledgeFailure;

/**
 * Historial de una entrada para auditoria (HU-41 criterios 4 y 6): versiones
 * de la mas antigua a la vigente, y los eventos de auditoria que las produjeron.
 */
export class GetKnowledgeEntryHistory {
  constructor(private readonly dependencies: { readonly entries: KnowledgeEntryRepositoryPort; readonly auditLog: KnowledgeAuditLogPort }) {}

  async execute(input: { readonly entryId: string }): Promise<GetKnowledgeEntryHistoryResult> {
    const entry = await this.dependencies.entries.findById(input.entryId);
    if (entry === null) return entryNotFound(input.entryId);

    const previous = entry.history.map((version: KnowledgeEntryVersion): KnowledgeEntryVersionView => ({ ...version, current: false }));
    const current: KnowledgeEntryVersionView = {
      version: entry.version,
      title: entry.title,
      content: entry.content,
      category: entry.category,
      keywords: entry.keywords,
      replacedAt: null,
      replacedBy: null,
      current: true
    };
    return { ok: true, versions: [...previous, current], audit: await this.dependencies.auditLog.findByEntryId(entry.id) };
  }
}
