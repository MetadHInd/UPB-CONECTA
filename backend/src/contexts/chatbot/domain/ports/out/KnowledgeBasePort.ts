import type { KnowledgeEntry } from '../../entities/KnowledgeEntry.js';

/**
 * Vista minima de la base de conocimiento que HU-42 necesita. La base que administra
 * HU-41 (contexto `knowledge`) se adapta a este puerto con `KnowledgeContextBase`.
 */
export interface KnowledgeBasePort {
  /** Entradas VIGENTES relevantes para la consulta. Vacio si no hay ninguna. */
  searchCurrent(query: string): Promise<KnowledgeEntry[]>;
  /** Entrada por id, o `null` si no existe. La vigencia la decide el dominio de HU-42. */
  findById(id: string): Promise<KnowledgeEntry | null>;
}
