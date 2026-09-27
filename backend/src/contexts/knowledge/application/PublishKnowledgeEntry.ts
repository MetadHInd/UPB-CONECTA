import { neutralizeHtml } from '../../hardening/domain/services/HtmlEncoding.js';
import type { KnowledgeEntry } from '../domain/entities/KnowledgeEntry.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { KnowledgeAuditEventKind, type KnowledgeAuditLogPort } from '../domain/ports/out/KnowledgeAuditLogPort.js';
import type { KnowledgeEntryIdGeneratorPort } from '../domain/ports/out/KnowledgeEntryIdGeneratorPort.js';
import type { KnowledgeEntryRepositoryPort } from '../domain/ports/out/KnowledgeEntryRepositoryPort.js';
import { validateNewKnowledgeEntry, type KnowledgeBaseSchema } from '../domain/services/KnowledgeEntryValidation.js';
import { invalidEntry, type KnowledgeFailure } from './KnowledgeEntryResults.js';

export type PublishKnowledgeEntryResult = { readonly ok: true; readonly entry: KnowledgeEntry } | KnowledgeFailure;

/**
 * Crear una entrada (HU-41 criterios 1, 2, 5 y 6). Se valida en el servidor
 * antes de tocar nada; al guardarse queda vigente para el chatbot sin
 * redespliegue, porque `KnowledgeBasePort` lee del mismo repositorio. El
 * verbo es "Publish" (no "Create") para que `check:authorization` exija su
 * rol en `protected-operations.json`.
 */
export class PublishKnowledgeEntry {
  constructor(
    private readonly dependencies: {
      readonly entries: KnowledgeEntryRepositoryPort;
      readonly auditLog: KnowledgeAuditLogPort;
      readonly idGenerator: KnowledgeEntryIdGeneratorPort;
      readonly schema: KnowledgeBaseSchema;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: { readonly form: Readonly<Record<string, unknown>>; readonly publishedBy: string }): Promise<PublishKnowledgeEntryResult> {
    const { entries, auditLog, idGenerator, schema, clock } = this.dependencies;
    const validation = validateNewKnowledgeEntry(input.form, schema);
    if (!validation.ok) return invalidEntry(validation.issues);

    const now = clock.now();
    const entry: KnowledgeEntry = {
      id: idGenerator.next(),
      title: neutralizeHtml(validation.value.title),
      content: neutralizeHtml(validation.value.content),
      category: validation.value.category,
      keywords: validation.value.keywords,
      version: 1,
      history: [],
      createdBy: input.publishedBy,
      createdAt: now,
      updatedBy: input.publishedBy,
      updatedAt: now,
      withdrawnAt: null,
      withdrawnBy: null
    };
    await entries.save(entry);
    await auditLog.record({ kind: KnowledgeAuditEventKind.CREATED, entryId: entry.id, actor: input.publishedBy, occurredAt: now, version: entry.version });
    return { ok: true, entry };
  }
}
