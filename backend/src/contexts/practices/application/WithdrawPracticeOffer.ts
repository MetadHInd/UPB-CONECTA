import { ConvocatoriaAlreadyWithdrawnError, ConvocatoriaNotFoundError, type WithdrawConvocatoria } from '../../ingestion/application/WithdrawConvocatoria.js';
import type { PracticeOfferDetails } from '../domain/entities/PracticeOffer.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { PracticeOfferRepositoryPort } from '../domain/ports/out/PracticeOfferRepositoryPort.js';
import { offerNotFound, offerWithdrawn, type PracticeOfferFailure } from './PracticeOfferResults.js';

export type WithdrawPracticeOfferResult = { readonly ok: true; readonly offer: PracticeOfferDetails } | PracticeOfferFailure;

/**
 * Retirar una oferta manual (HU-24 criterio 5) a traves de
 * `WithdrawConvocatoria` (HU-50): sale del feed, se cancelan sus avisos y el
 * retiro queda auditado. No se borra: la oferta conserva `withdrawnAt` para
 * que HU-23 pueda informar al estudiante que la seguia.
 */
export class WithdrawPracticeOffer {
  constructor(
    private readonly dependencies: {
      readonly withdrawConvocatoria: WithdrawConvocatoria;
      readonly offers: PracticeOfferRepositoryPort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: { readonly messageId: string; readonly withdrawnBy: string }): Promise<WithdrawPracticeOfferResult> {
    const { withdrawConvocatoria, offers, clock } = this.dependencies;
    const current = await offers.findByMessageId(input.messageId);
    if (current === null) return offerNotFound(input.messageId);
    if (current.withdrawnAt !== null) return offerWithdrawn();

    const now = clock.now();
    try {
      await withdrawConvocatoria.execute({ convocatoriaId: current.convocatoriaId, withdrawnBy: input.withdrawnBy });
    } catch (error) {
      if (error instanceof ConvocatoriaNotFoundError) return offerNotFound(input.messageId);
      if (!(error instanceof ConvocatoriaAlreadyWithdrawnError)) throw error;
      // Ya estaba retirada por HU-50 directo: la oferta se alinea sin volver a auditar.
    }

    const offer: PracticeOfferDetails = { ...current, withdrawnAt: now, updatedBy: input.withdrawnBy, updatedAt: now };
    await offers.save(offer);
    return { ok: true, offer };
  }
}
