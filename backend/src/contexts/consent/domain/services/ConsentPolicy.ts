import type { ConsentRecord } from '../entities/ConsentRecord.js';

export type ConsentStatus =
  | { readonly kind: 'vigente'; readonly record: ConsentRecord }
  | { readonly kind: 'requiere-consentimiento'; readonly reason: 'nunca-acepto' | 'version-desactualizada' };

/**
 * HU-44, criterios 1, 3 y 5: decide si el estudiante puede continuar o debe
 * (re)consentir. Una version nueva publicada invalida la aceptacion previa
 * (criterio 5) — vigente exige version exacta, no "alguna vez acepto".
 */
export class ConsentPolicy {
  evaluate(latest: ConsentRecord | null, currentVersion: string): ConsentStatus {
    if (latest === null) {
      return { kind: 'requiere-consentimiento', reason: 'nunca-acepto' };
    }
    if (latest.version !== currentVersion) {
      return { kind: 'requiere-consentimiento', reason: 'version-desactualizada' };
    }
    return { kind: 'vigente', record: latest };
  }
}
