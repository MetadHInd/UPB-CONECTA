import type { KnowledgeEntry } from '../domain/entities/KnowledgeEntry.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { KnowledgeAuditEventKind, type KnowledgeAuditLogPort } from '../domain/ports/out/KnowledgeAuditLogPort.js';
import type { KnowledgeEntryRepositoryPort } from '../domain/ports/out/KnowledgeEntryRepositoryPort.js';
import { entryNotFound, entryWithdrawn, type KnowledgeFailure } from './KnowledgeEntryResults.js';

export type WithdrawKnowledgeEntryResult = { readonly ok: true; readonly entry: KnowledgeEntry } | KnowledgeFailure;

/**
 * Retirar una entrada (HU-41 criterios 1, 3 y 6). Retiro logico, como el de
 * convocatorias (HU-50): no se borra, conserva su historial y deja de ser
 * fuente porque `KnowledgeBasePort` solo lee entradas vigentes.
 */
export class WithdrawKnowledgeEntry {
  constructor(
    private readonly dependencies: {
      readonly entries: KnowledgeEntryRepositoryPort;
      readonly auditLog: KnowledgeAuditLogPort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: { readonly entryId: string; readonly withdrawnBy: string }): Promise<WithdrawKnowledgeEntryResult> {
    const { entries, auditLog, clock } = this.dependencies;
    const current = await entries.findById(input.entryId);
    if (current === null) return entryNotFound(input.entryId);
    if (current.withdrawnAt !== null) return entryWithdrawn();

    const now = clock.now();
    const entry: KnowledgeEntry = { ...current, withdrawnAt: now, withdrawnBy: input.withdrawnBy, updatedBy: input.withdrawnBy, updatedAt: now };
    await entries.save(entry);
    await auditLog.record({ kind: KnowledgeAuditEventKind.WITHDRAWN, entryId: entry.id, actor: input.withdrawnBy, occurredAt: now, version: entry.version });
    return { ok: true, entry };
  }
}
