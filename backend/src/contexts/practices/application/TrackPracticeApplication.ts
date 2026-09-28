import type { PracticeApplicationTracking } from '../domain/entities/PracticeApplicationTracking.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { PracticeApplicationTrackingRepositoryPort } from '../domain/ports/out/PracticeApplicationTrackingRepositoryPort.js';
import type { PracticeConvocatoriaSourcePort } from '../domain/ports/out/PracticeConvocatoriaSourcePort.js';
import { isListablePractice } from '../domain/services/PracticeListingPolicy.js';
import { parseApplicationStatus } from '../domain/services/PracticeTrackingPolicy.js';
import { offerNotFound, type PracticeOfferFailure } from './PracticeOfferResults.js';

export type TrackPracticeApplicationResult =
  | { readonly ok: true; readonly tracking: PracticeApplicationTracking; readonly changed: boolean }
  | { readonly ok: false; readonly error: 'invalid-status'; readonly message: string }
  | PracticeOfferFailure;

/**
 * HU-23 (RF-34), criterios 1 y 2: el estudiante registra o cambia su estado
 * frente a una oferta. Cada cambio se agrega al historial con su marca de
 * tiempo; repetir el estado vigente no escribe nada.
 *
 * Empezar a seguir exige que la oferta este publicada: no se sigue lo que el
 * estudiante no puede ver. Un seguimiento existente se puede actualizar
 * aunque la oferta ya no este (retirada o cerrada), para que el estudiante
 * pueda, por ejemplo, darlo por cerrado.
 *
 * `studentId` es el correo de la sesion autenticada (HU-43), nunca un dato
 * del cuerpo de la peticion: nadie registra estados en nombre de otro.
 * Operacion del estudiante, no administrativa: no figura en
 * `config/protected-operations.json`.
 */
export class TrackPracticeApplication {
  constructor(
    private readonly dependencies: {
      readonly trackings: PracticeApplicationTrackingRepositoryPort;
      readonly source: PracticeConvocatoriaSourcePort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: { readonly studentId: string; readonly offerId: string; readonly status: unknown }): Promise<TrackPracticeApplicationResult> {
    const { trackings, source, clock } = this.dependencies;
    const status = parseApplicationStatus(input.status);
    if (!status.ok) return { ok: false, error: 'invalid-status', message: status.message };

    const current = await trackings.findByStudentAndOffer(input.studentId, input.offerId);
    if (current !== null && current.status === status.value) return { ok: true, tracking: current, changed: false };

    const now = clock.now();
    let tracking: PracticeApplicationTracking;
    if (current === null) {
      const offer = await source.findPracticeConvocatoria(input.offerId);
      if (offer === null || !isListablePractice(offer)) return offerNotFound(input.offerId);
      tracking = {
        studentId: input.studentId,
        offerId: input.offerId,
        offerTitle: offer.record.subject,
        company: offer.details?.company ?? null,
        status: status.value,
        history: [{ status: status.value, at: now }],
        createdAt: now,
        updatedAt: now
      };
    } else {
      tracking = {
        ...current,
        status: status.value,
        history: [...current.history, { status: status.value, at: now }],
        updatedAt: now
      };
    }

    await trackings.save(tracking);
    return { ok: true, tracking, changed: true };
  }
}
