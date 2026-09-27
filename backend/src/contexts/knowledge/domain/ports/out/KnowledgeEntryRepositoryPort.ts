import type { KnowledgeEntry } from '../../entities/KnowledgeEntry.js';

export interface KnowledgeEntryRepositoryPort {
  findById(id: string): Promise<KnowledgeEntry | null>;
  /** Todas, retiradas incluidas (panel de administracion). */
  findAll(): Promise<readonly KnowledgeEntry[]>;
  /** Solo las vigentes (lectura del chatbot). */
  findActive(): Promise<readonly KnowledgeEntry[]>;
  save(entry: KnowledgeEntry): Promise<void>;
}
