import type { PracticeOfferIssue } from '../domain/services/PracticeOfferValidation.js';

export enum PracticeOfferFailureKind {
  INVALID_OFFER = 'invalid-offer',
  OFFER_NOT_FOUND = 'offer-not-found',
  OFFER_WITHDRAWN = 'offer-withdrawn'
}

export type PracticeOfferFailure = {
  readonly ok: false;
  readonly error: PracticeOfferFailureKind;
  readonly message: string;
  /** Solo en `invalid-offer`: que falta o esta mal, campo por campo (HU-24 criterio 3). */
  readonly issues?: readonly PracticeOfferIssue[];
};

export function invalidOffer(issues: readonly PracticeOfferIssue[]): PracticeOfferFailure {
  return {
    ok: false,
    error: PracticeOfferFailureKind.INVALID_OFFER,
    message: `No se guardó la oferta. ${issues.map((issue) => issue.message).join(' ')}`,
    issues
  };
}

export function offerNotFound(messageId: string): PracticeOfferFailure {
  return { ok: false, error: PracticeOfferFailureKind.OFFER_NOT_FOUND, message: `No existe la oferta de práctica "${messageId}".` };
}

export function offerWithdrawn(): PracticeOfferFailure {
  return { ok: false, error: PracticeOfferFailureKind.OFFER_WITHDRAWN, message: 'La oferta ya fue retirada.' };
}
