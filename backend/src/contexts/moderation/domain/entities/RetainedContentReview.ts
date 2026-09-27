import type { ModeratedContentKind } from '../value-objects/ModerationDecisionInput.js';

export type RetainedReviewStatus = 'pending' | 'approved' | 'rejected';

/**
 * HU-32, criterio 5: todo contenido retenido entra a la cola con un plazo de
 * resolucion humana (por defecto 24 h desde que se retuvo). `category` y
 * `fragment` son los que motivaron la retencion: se conservan para poder
 * sustentar la decision ante el usuario (criterio 6). Es un modelo distinto
 * de `ReviewQueueItem` (HU-49), que cubre cuarentena y clasificacion de
 * convocatorias; aqui el elemento es contenido del foro de un estudiante.
 */
export interface RetainedContentReview {
  readonly contentId: string;
  readonly contentKind: ModeratedContentKind;
  readonly authorEmail: string;
  readonly category: string;
  readonly fragment: string;
  readonly retainedAt: Date;
  readonly resolutionDeadline: Date;
  readonly status: RetainedReviewStatus;
  readonly resolvedAt: Date | null;
  readonly resolvedBy: string | null;
  /** Instante en que se aviso a los administradores de que vencio el plazo; una sola vez. */
  readonly escalatedAt: Date | null;
}

/** Vencida: sigue pendiente y ya paso el plazo (exactamente en el limite aun esta a tiempo). */
export function isReviewOverdue(review: RetainedContentReview, now: Date): boolean {
  return review.status === 'pending' && now.getTime() > review.resolutionDeadline.getTime();
}
