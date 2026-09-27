import type { PracticeOfferDetails } from '../../entities/PracticeOffer.js';

/**
 * Lo propio de una oferta de practica (empresa, requisitos, modalidad),
 * enlazado por `messageId` a la convocatoria que la publica. Lo comun a toda
 * convocatoria no se duplica aqui: sigue en `ingestion`, `classification` y
 * `targeting`, donde ya lo leen el feed y el planificador de avisos.
 */
export interface PracticeOfferRepositoryPort {
  findByMessageId(messageId: string): Promise<PracticeOfferDetails | null>;
  /** HU-22: version en lote para el listado, sin una consulta por oferta. */
  findByMessageIds(messageIds: readonly string[]): Promise<ReadonlyMap<string, PracticeOfferDetails>>;
  save(offer: PracticeOfferDetails): Promise<void>;
}
