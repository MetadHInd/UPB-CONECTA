import type { PublicationStatus } from '../entities/ClassificationResult.js';
import type { ConfidenceScore } from '../value-objects/ConfidenceScore.js';
import type { ReviewThreshold } from '../value-objects/ReviewThreshold.js';

/**
 * Politica de dominio pura (HU-10, diseño explicito): decide si un documento
 * se publica o queda en revision pendiente, sin ningun I/O — testeable sin
 * infraestructura.
 *
 * Convencion sobre el limite exacto (criterios 2 y 3): un puntaje
 * estrictamente menor al umbral es "por debajo" (criterio 2, revision
 * pendiente); un puntaje igual o mayor al umbral cuenta como "sobre el
 * umbral" (criterio 3, publicado) — el umbral mismo pasa, no lo intercepta.
 */
export function decidePublicationStatus(score: ConfidenceScore, threshold: ReviewThreshold): PublicationStatus {
  return score.value < threshold.value ? 'pending-review' : 'published';
}
