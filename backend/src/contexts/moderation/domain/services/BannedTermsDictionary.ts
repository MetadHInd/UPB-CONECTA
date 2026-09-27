import { normalizeForMatching } from './TextNormalization.js';

/**
 * Diccionario configurable de términos y expresiones vetadas (HU-31
 * criterio 2). Coincide por palabra completa, sin distinguir mayúsculas ni
 * tildes, y con cualquier espacio en blanco entre las palabras de una
 * expresión. Una entrada vacía se ignora (bloquearía todo el foro).
 */
export class BannedTermsDictionary {
  private readonly patterns: readonly RegExp[];

  constructor(terms: readonly string[]) {
    this.patterns = terms
      .map((term) => normalizeForMatching(term).trim())
      .filter((term) => term !== '')
      .map((term) => {
        const body = term.split(/\s+/).map(escapeRegExp).join('\\s+');
        return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'u');
      });
  }

  matches(text: string): boolean {
    const normalized = normalizeForMatching(text);
    return this.patterns.some((pattern) => pattern.test(normalized));
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
