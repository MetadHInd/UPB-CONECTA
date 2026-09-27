/**
 * HU-32: lo que el autor ve de una decision de moderacion.
 *
 * Es una representacion DISTINTA del registro de auditoria
 * (`ContentModerationLogPort`) aunque describan la misma decision: el registro
 * conserva el fragmento, la categoria y el detalle interno para sustentar la
 * sancion; la vista solo lleva lo que se le puede decir al estudiante. Por
 * construccion ningun tipo de esta union tiene campos de puntaje, umbral ni
 * modelo (criterio 3), asi que una futura capa HTTP no puede filtrarlos por
 * accidente.
 */
export interface CommunityNormView {
  readonly code: string;
  readonly title: string;
  readonly text: string;
}

export interface InReviewFeedback {
  readonly kind: 'in-review';
  readonly contentId: string;
  readonly message: string;
  /** Tiempo maximo de resolucion humana, en horas (criterio 1). */
  readonly maxResolutionHours: number;
  /** Instante limite de resolucion. */
  readonly resolutionDeadline: Date;
}

export interface BlockedFeedback {
  readonly kind: 'blocked';
  readonly contentId: string;
  readonly message: string;
  /** Motivo en lenguaje del estudiante (criterio 2). */
  readonly reason: string;
  /** Norma de convivencia infringida (criterio 2). */
  readonly norm: CommunityNormView;
}

/** La revision humana aprobo lo retenido y ya se publico (criterio 4). */
export interface ApprovedFeedback {
  readonly kind: 'approved';
  readonly contentId: string;
  readonly message: string;
}

/** La revision humana confirmo la infraccion: mismo contenido que un bloqueo directo. */
export interface RejectedFeedback extends Omit<BlockedFeedback, 'kind'> {
  readonly kind: 'rejected';
}

export type AuthorFeedbackView = InReviewFeedback | BlockedFeedback | ApprovedFeedback | RejectedFeedback;
