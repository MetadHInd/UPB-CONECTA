import type { KnowledgeEntry } from '../entities/KnowledgeEntry.js';

const TITLE_WEIGHT = 3;
const KEYWORD_WEIGHT = 3;
const CONTENT_WEIGHT = 1;
const MIN_TOKEN_LENGTH = 3;

/** Minusculas y sin tildes: "Matrícula" y "matricula" son la misma palabra para quien pregunta. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9ñ]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/**
 * Busqueda por coincidencia de palabras sobre entradas ya vigentes. El titulo
 * y las palabras clave pesan mas que el contenido; a igual puntaje gana la
 * actualizada mas recientemente. Deliberadamente simple: la recuperacion
 * semantica pertenece al chatbot (HU-42), no a la base de conocimiento.
 */
export function rankKnowledgeEntries(entries: readonly KnowledgeEntry[], query: string, limit: number): KnowledgeEntry[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0 || limit <= 0) return [];

  const scored = entries
    .map((entry) => {
      const title = new Set(tokenize(entry.title));
      const keywords = new Set(entry.keywords.flatMap(tokenize));
      const content = new Set(tokenize(entry.content));
      const score = queryTokens.reduce(
        (sum, token) => sum + (title.has(token) ? TITLE_WEIGHT : 0) + (keywords.has(token) ? KEYWORD_WEIGHT : 0) + (content.has(token) ? CONTENT_WEIGHT : 0),
        0
      );
      return { entry, score };
    })
    .filter(({ score }) => score > 0);

  scored.sort((a, b) => b.score - a.score || b.entry.updatedAt.getTime() - a.entry.updatedAt.getTime());
  return scored.slice(0, limit).map(({ entry }) => entry);
}
