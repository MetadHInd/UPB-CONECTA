import { sourceKey, type AnchoredSource } from '../value-objects/SourceReference.js';

export type AnchoringFailure = 'empty-text' | 'no-sources' | 'unverifiable-source';

export type AnchoringResult =
  | { readonly ok: true; readonly sources: readonly AnchoredSource[] }
  | { readonly ok: false; readonly reason: AnchoringFailure };

/**
 * Invariante de no alucinacion (HU-42 criterios 1, 2 y 6), aplicado sobre la
 * salida del modelo. `resolved` trae una posicion por cada fuente propuesta:
 * la fuente verificada contra el repositorio, o `null` si no existe o no es
 * vigente. La respuesta se entrega solo si tiene texto, al menos una fuente y
 * TODAS sus fuentes se verificaron: una sola cita inexistente invalida toda la
 * respuesta (fail-safe, como la moderacion).
 */
export function anchorResponse(text: string, resolved: readonly (AnchoredSource | null)[]): AnchoringResult {
  if (text.trim() === '') return { ok: false, reason: 'empty-text' };
  if (resolved.length === 0) return { ok: false, reason: 'no-sources' };
  const verified: AnchoredSource[] = [];
  const seen = new Set<string>();
  for (const source of resolved) {
    if (source === null) return { ok: false, reason: 'unverifiable-source' };
    const key = sourceKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    verified.push(source);
  }
  return { ok: true, sources: verified };
}
