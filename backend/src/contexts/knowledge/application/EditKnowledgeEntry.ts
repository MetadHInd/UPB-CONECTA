import { neutralizeHtml } from '../../hardening/domain/services/HtmlEncoding.js';
import { KNOWLEDGE_ENTRY_FIELDS, type KnowledgeEntry, type KnowledgeEntryData, type KnowledgeEntryField } from '../domain/entities/KnowledgeEntry.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { KnowledgeAuditEventKind, type KnowledgeAuditLogPort } from '../domain/ports/out/KnowledgeAuditLogPort.js';
import type { KnowledgeEntryRepositoryPort } from '../domain/ports/out/KnowledgeEntryRepositoryPort.js';
import { validateKnowledgeEntryChanges, type KnowledgeBaseSchema } from '../domain/services/KnowledgeEntryValidation.js';
import { entryNotFound, entryWithdrawn, invalidEntry, type KnowledgeFailure } from './KnowledgeEntryResults.js';

export type EditKnowledgeEntryResult =
  | { readonly ok: true; readonly entry: KnowledgeEntry; readonly changedFields: readonly KnowledgeEntryField[] }
  | KnowledgeFailure;

function sameValue(a: KnowledgeEntryData[KnowledgeEntryField], b: KnowledgeEntryData[KnowledgeEntryField]): boolean {
  return Array.isArray(a) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
}

/**
 * Editar una entrada vigente (HU-41 criterios 1, 4, 5 y 6). Un cambio real
 * apila la version anterior completa, con quien y cuando la reemplazo, y sube
 * `version`. Enviar valores iguales a los actuales no crea version ni
 * auditoria: no hubo cambio que auditar.
 */
export class EditKnowledgeEntry {
  constructor(
    private readonly dependencies: {
      readonly entries: KnowledgeEntryRepositoryPort;
      readonly auditLog: KnowledgeAuditLogPort;
      readonly schema: KnowledgeBaseSchema;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: { readonly entryId: string; readonly form: Readonly<Record<string, unknown>>; readonly editedBy: string }): Promise<EditKnowledgeEntryResult> {
    const { entries, auditLog, schema, clock } = this.dependencies;
    const current = await entries.findById(input.entryId);
    if (current === null) return entryNotFound(input.entryId);
    if (current.withdrawnAt !== null) return entryWithdrawn();

    const validation = validateKnowledgeEntryChanges(input.form, schema);
    if (!validation.ok) return invalidEntry(validation.issues);

    const proposed: Partial<KnowledgeEntryData> = {
      ...validation.value,
      ...(validation.value.title !== undefined ? { title: neutralizeHtml(validation.value.title) } : {}),
      ...(validation.value.content !== undefined ? { content: neutralizeHtml(validation.value.content) } : {})
    };
    const changedFields = KNOWLEDGE_ENTRY_FIELDS.filter((field) => proposed[field] !== undefined && !sameValue(proposed[field]!, current[field]));
    if (changedFields.length === 0) return { ok: true, entry: current, changedFields };

    const now = clock.now();
    const next: KnowledgeEntry = {
      ...current,
      ...proposed,
      version: current.version + 1,
      history: [
        ...current.history,
        {
          version: current.version,
          title: current.title,
          content: current.content,
          category: current.category,
          keywords: current.keywords,
          replacedAt: now,
          replacedBy: input.editedBy
        }
      ],
      updatedBy: input.editedBy,
      updatedAt: now
    };
    await entries.save(next);
    await auditLog.record({ kind: KnowledgeAuditEventKind.EDITED, entryId: next.id, actor: input.editedBy, occurredAt: now, version: next.version, changedFields });
    return { ok: true, entry: next, changedFields };
  }
}
