import { normalizeForMatching } from './TextNormalization.js';

/**
 * Diccionario configurable de términos y expresiones vetadas (HU-31
 * criterio 2). Coincide por palabra completa, sin distinguir mayúsculas ni
 * tildes, y con cualquier espacio en blanco entre las palabras de una
 * expresión. Una entrada vacía se ignora (bloquearía todo el foro).
 */
export class BannedTermsDictionary {
  private readonly entries: readonly { readonly term: string; readonly pattern: RegExp }[];

  constructor(terms: readonly string[]) {
    this.entries = terms
      .map((term) => ({ term, normalized: normalizeForMatching(term).trim() }))
      .filter(({ normalized }) => normalized !== '')
      .map(({ term, normalized }) => {
        const body = normalized.split(/\s+/).map(escapeRegExp).join('\\s+');
        return { term, pattern: new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'u') };
      });
  }

  matches(text: string): boolean {
    return this.findMatches(text).length > 0;
  }

  /** Las expresiones del diccionario que aparecen en el texto, tal como están escritas en él (HU-52 criterio 4). */
  findMatches(text: string): string[] {
    const normalized = normalizeForMatching(text);
    return this.entries.filter(({ pattern }) => pattern.test(normalized)).map(({ term }) => term);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
