/**
 * Version anterior de una entrada (HU-41 criterio 4): copia completa de lo
 * que decia hasta que alguien la edito, con quien y cuando la reemplazo.
 */
export interface KnowledgeEntryVersion {
  readonly version: number;
  readonly title: string;
  readonly content: string;
  readonly category: string;
  readonly keywords: readonly string[];
  readonly replacedAt: Date;
  readonly replacedBy: string;
}

/**
 * Entrada de la base de conocimiento institucional (HU-41, RF-66). Es dato del
 * dominio bajo control institucional, no conocimiento embebido en el modelo:
 * el chatbot solo la lee, a traves de `KnowledgeBasePort`, y solo mientras
 * este vigente (`withdrawnAt === null`).
 *
 * El agregado guarda su propio historial: las versiones anteriores viajan con
 * la entrada, asi que editar y auditar no dependen de una segunda coleccion.
 */
export interface KnowledgeEntry {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly category: string;
  readonly keywords: readonly string[];
  /** Empieza en 1 y sube con cada edicion que cambia algo. */
  readonly version: number;
  readonly history: readonly KnowledgeEntryVersion[];
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedBy: string;
  readonly updatedAt: Date;
  /** Retiro logico: la entrada no se borra, deja de ser fuente. */
  readonly withdrawnAt: Date | null;
  readonly withdrawnBy: string | null;
}

/** Campos que el administrador diligencia. */
export interface KnowledgeEntryData {
  readonly title: string;
  readonly content: string;
  readonly category: string;
  readonly keywords: readonly string[];
}

export type KnowledgeEntryField = keyof KnowledgeEntryData;

/** Orden en que se reportan los campos cambiados. */
export const KNOWLEDGE_ENTRY_FIELDS: readonly KnowledgeEntryField[] = ['title', 'content', 'category', 'keywords'];

/** Campos sin los que la entrada no se guarda (criterio 5); las palabras clave son opcionales. */
export const REQUIRED_KNOWLEDGE_ENTRY_FIELDS: readonly KnowledgeEntryField[] = ['title', 'content', 'category'];
