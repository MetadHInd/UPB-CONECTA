/**
 * Entrada de la base de conocimiento (HU-41), en la forma minima que HU-42
 * necesita para anclar una respuesta. HU-41 es duena del agregado completo;
 * este tipo es la vista de solo lectura del chatbot.
 */
export interface KnowledgeEntry {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  /** Fin de vigencia, o `null` si no vence. */
  readonly validUntil: Date | null;
}

export function isCurrentKnowledgeEntry(entry: KnowledgeEntry, now: Date): boolean {
  return entry.validUntil === null || entry.validUntil.getTime() > now.getTime();
}
