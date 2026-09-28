import type { ModerationReason, ModerationVerdict } from '../services/ModerationDecisionPolicy.js';
import type { ModeratedContentKind } from '../value-objects/ModerationDecisionInput.js';
import type { ModerationThresholdValues } from '../ports/out/ModerationRulesAuditPort.js';

/** Resolución de una persona sobre un contenido retenido (HU-52 criterio 5). */
export interface HumanModerationResolution {
  readonly outcome: 'approved' | 'rejected';
  readonly reviewer: string;
  /** Categoría de infracción con la que se resolvió. */
  readonly category: string;
  readonly resolvedAt: Date;
}

/**
 * Registro de una decisión de la moderación automática (HU-52 criterio 4),
 * incluida la de publicar: conserva el texto evaluado, el puntaje, los
 * umbrales y las expresiones del diccionario vigentes en ese instante, y la
 * decisión. Así una decisión se puede explicar después aunque el
 * administrador haya cambiado las reglas.
 *
 * La parte automática no se modifica nunca. Las resoluciones humanas se
 * anexan en `resolutions` (criterio 5). No guarda el correo del autor: el
 * contenido se vincula por `contentId`.
 */
export interface AutomaticModerationRecord {
  readonly recordId: string;
  readonly contentId: string;
  readonly contentKind: ModeratedContentKind;
  /** Título y cuerpo tal como se evaluaron, con el marcado neutralizado (HU-47). */
  readonly evaluatedText: string;
  /** `null` si el servicio no entregó un puntaje utilizable. */
  readonly score: number | null;
  readonly thresholds: ModerationThresholdValues;
  /** Expresiones del diccionario que coincidieron; vacío si ninguna. */
  readonly matchedTerms: readonly string[];
  readonly verdict: ModerationVerdict;
  readonly reason: ModerationReason;
  readonly decidedAt: Date;
  readonly resolutions: readonly HumanModerationResolution[];
}
