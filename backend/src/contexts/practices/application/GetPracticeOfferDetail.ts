import type { PracticeOfferDetail } from '../domain/entities/PracticeOfferListing.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { PracticeConvocatoriaSourcePort } from '../domain/ports/out/PracticeConvocatoriaSourcePort.js';
import { isListablePractice, toDetail } from '../domain/services/PracticeListingPolicy.js';

/**
 * HU-22 (RF-33), criterio 3: detalle completo de una oferta de practica:
 * empresa, descripcion, requisitos, modalidad, fecha de cierre y canal de
 * postulacion. Es la misma entidad que el listado, con los campos que el
 * listado resume. Devuelve `null` si no existe, no es una practica o ya no
 * esta visible (retirada o en revision).
 *
 * Limitacion explicita: una oferta que llego por la ingesta no trae empresa,
 * requisitos ni modalidad (la extraccion automatica no existe todavia). Esos
 * campos salen `null` y `missingFields` los nombra, para que el cliente
 * muestre "no informado" en vez de inventar un dato.
 */
export class GetPracticeOfferDetail {
  constructor(
    private readonly dependencies: {
      readonly source: PracticeConvocatoriaSourcePort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(query: { readonly offerId: string }): Promise<PracticeOfferDetail | null> {
    const found = await this.dependencies.source.findPracticeConvocatoria(query.offerId);
    return found && isListablePractice(found) ? toDetail(found, this.dependencies.clock.now()) : null;
  }
}
