import { EditKnowledgeEntry } from '../../src/contexts/knowledge/application/EditKnowledgeEntry.js';
import { GetKnowledgeEntryHistory } from '../../src/contexts/knowledge/application/GetKnowledgeEntryHistory.js';
import { ListKnowledgeEntries } from '../../src/contexts/knowledge/application/ListKnowledgeEntries.js';
import { PublishKnowledgeEntry } from '../../src/contexts/knowledge/application/PublishKnowledgeEntry.js';
import { WithdrawKnowledgeEntry } from '../../src/contexts/knowledge/application/WithdrawKnowledgeEntry.js';
import type { KnowledgeAuditLogPort } from '../../src/contexts/knowledge/domain/ports/out/KnowledgeAuditLogPort.js';
import type { KnowledgeEntryRepositoryPort } from '../../src/contexts/knowledge/domain/ports/out/KnowledgeEntryRepositoryPort.js';
import type { KnowledgeBaseSchema } from '../../src/contexts/knowledge/domain/services/KnowledgeEntryValidation.js';
import { InMemoryKnowledgeAuditLog } from '../../src/contexts/knowledge/infrastructure/adapters/out/memory/InMemoryKnowledgeAuditLog.js';
import { InMemoryKnowledgeEntryRepository } from '../../src/contexts/knowledge/infrastructure/adapters/out/memory/InMemoryKnowledgeEntryRepository.js';
import { RepositoryKnowledgeBase } from '../../src/contexts/knowledge/infrastructure/adapters/out/RepositoryKnowledgeBase.js';
import { loadKnowledgeBaseSchema } from '../../src/contexts/knowledge/infrastructure/config/JsonKnowledgeBaseSchema.js';

export const ADMIN = 'contenido@upb.edu.co';
export const T0 = new Date('2026-09-26T15:00:00Z');

export const SCHEMA: KnowledgeBaseSchema = await loadKnowledgeBaseSchema();

export function validForm(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Fechas de matrícula 2026-2',
    content: 'La matrícula ordinaria del segundo semestre va del 3 al 14 de agosto. Se paga en la plataforma de pagos.',
    category: 'matriculas',
    keywords: ['matrícula', 'pagos'],
    ...overrides
  };
}

/** Cablea el backoffice de la base de conocimiento y el puerto que consumira el chatbot (HU-42). */
export function buildKnowledgeHarness<A extends KnowledgeAuditLogPort = InMemoryKnowledgeAuditLog>(
  options: { readonly entries?: KnowledgeEntryRepositoryPort; readonly auditLog?: A } = {}
) {
  let now = T0;
  let sequence = 0;
  const clock = { now: () => now };
  const idGenerator = { next: () => `kb-${++sequence}` };
  const entries = options.entries ?? new InMemoryKnowledgeEntryRepository();
  const auditLog = (options.auditLog ?? new InMemoryKnowledgeAuditLog()) as A;
  const dependencies = { entries, auditLog, schema: SCHEMA, clock };

  return {
    entries,
    auditLog,
    /** Lo unico que ve el chatbot: no conoce casos de uso ni administracion. */
    knowledgeBase: new RepositoryKnowledgeBase(entries),
    setNow(date: Date) {
      now = date;
    },
    publish: new PublishKnowledgeEntry({ ...dependencies, idGenerator }),
    edit: new EditKnowledgeEntry(dependencies),
    withdraw: new WithdrawKnowledgeEntry(dependencies),
    list: new ListKnowledgeEntries({ entries }),
    history: new GetKnowledgeEntryHistory({ entries, auditLog })
  };
}
