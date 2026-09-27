import type {
  ApprovedFeedback,
  BlockedFeedback,
  CommunityNormView,
  InReviewFeedback,
  RejectedFeedback
} from '../value-objects/AuthorFeedback.js';
import { findNormForCategory, type ModerationFeedbackConfig } from '../value-objects/ModerationFeedbackConfig.js';

export const HOUR_MS = 3_600_000;

export class UnknownInfractionCategoryError extends Error {
  constructor(category: string) {
    super(`La categoria de infraccion "${category}" no tiene una norma de convivencia configurada.`);
    this.name = 'UnknownInfractionCategoryError';
  }
}

export function resolutionDeadlineFor(config: ModerationFeedbackConfig, retainedAt: Date): Date {
  return new Date(retainedAt.getTime() + config.resolutionDeadlineHours * HOUR_MS);
}

function normViewFor(config: ModerationFeedbackConfig, category: string): CommunityNormView {
  const norm = findNormForCategory(config, category);
  if (norm === null) throw new UnknownInfractionCategoryError(category);
  return { code: norm.code, title: norm.title, text: norm.text };
}

/** Criterio 1: aviso de que la publicacion esta en revision, con el tiempo maximo de resolucion. */
export function inReviewFeedback(config: ModerationFeedbackConfig, contentId: string, retainedAt: Date): InReviewFeedback {
  const hours = config.resolutionDeadlineHours;
  return {
    kind: 'in-review',
    contentId,
    message:
      'Tu publicación está en revisión por parte del equipo de moderación. ' +
      `Recibirás una respuesta en un máximo de ${hours} ${hours === 1 ? 'hora' : 'horas'}.`,
    maxResolutionHours: hours,
    resolutionDeadline: resolutionDeadlineFor(config, retainedAt)
  };
}

function reasonText(norm: CommunityNormView): string {
  return `Tu contenido incumple la norma de convivencia ${norm.code} (${norm.title}): ${norm.text}`;
}

/** Criterio 2: motivo y norma infringida, sin puntaje, umbral ni detalle del modelo (criterio 3). */
export function blockedFeedback(config: ModerationFeedbackConfig, contentId: string, category: string): BlockedFeedback {
  const norm = normViewFor(config, category);
  return {
    kind: 'blocked',
    contentId,
    message: `Tu publicación fue bloqueada y no se publicó. ${reasonText(norm)}`,
    reason: reasonText(norm),
    norm
  };
}

/** Criterio 4: la revision humana confirmo la infraccion de lo retenido. */
export function rejectedFeedback(config: ModerationFeedbackConfig, contentId: string, category: string): RejectedFeedback {
  const norm = normViewFor(config, category);
  return {
    kind: 'rejected',
    contentId,
    message: `Tras revisarla, tu publicación no fue aprobada. ${reasonText(norm)}`,
    reason: reasonText(norm),
    norm
  };
}

/** Criterio 4: la revision humana aprobo lo retenido y ya se publico. */
export function approvedFeedback(contentId: string): ApprovedFeedback {
  return {
    kind: 'approved',
    contentId,
    message: 'Tu publicación fue revisada y aprobada: ya está publicada.'
  };
}
