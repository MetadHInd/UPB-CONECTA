/** Minúsculas y sin tildes: la comparación del diccionario y del enmascarado no distingue "Gómez" de "gomez". */
export function normalizeForMatching(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
