import type { DueDate } from '../../../ingestion/domain/value-objects/DueDate.js';
import type { ProgramTargeting } from '../../../targeting/domain/value-objects/ProgramTargeting.js';
import type { PracticeModality } from './PracticeOffer.js';

/**
 * HU-22, criterio 4: estado explicito de la convocatoria en el modelo de
 * lectura. Una fecha ambigua o la ausencia de plazo no cierran la oferta: se
 * muestran como abiertas, y `dueDate` conserva el matiz para quien lo necesite.
 */
export type PracticeOfferStatus = 'abierta' | 'cerrada';
export const PRACTICE_OFFER_STATUSES: readonly PracticeOfferStatus[] = ['abierta', 'cerrada'];

/** Filtro por estado (criterio 2): `todas` es la unica forma de mezclar vigentes y cerradas (criterio 4). */
export type PracticeStatusFilter = PracticeOfferStatus | 'todas';
export const DEFAULT_STATUS_FILTER: PracticeStatusFilter = 'abierta';

/** Campos del detalle que una oferta ingerida todavia no trae (la ingesta no los extrae). */
export type PracticeDetailField = 'company' | 'requirements' | 'modality' | 'applicationChannel';

/**
 * Fila del listado. Misma forma para toda oferta, venga de donde venga: no
 * hay campo de origen (criterio 1). `null` significa "no informado".
 */
export interface PracticeOfferListItem {
  /** `representativeMessageId` de la convocatoria: la identidad estable del registro consolidado. */
  readonly offerId: string;
  readonly title: string;
  readonly company: string | null;
  readonly modality: PracticeModality | null;
  readonly targeting: ProgramTargeting;
  readonly dueDate: DueDate;
  /** Fecha de cierre cuando se conoce con certeza; `null` si no hay plazo o es ambiguo. */
  readonly closesAt: Date | null;
  readonly status: PracticeOfferStatus;
}

/** Detalle completo (criterio 3). */
export interface PracticeOfferDetail extends PracticeOfferListItem {
  readonly description: string;
  readonly requirements: string | null;
  /** Enlace `http(s)` o `mailto:` por el que se postula. */
  readonly applicationChannel: string | null;
  /** Dominio del enlace, para mostrarlo antes de abrirlo (mismo criterio que HU-15); `null` en un correo. */
  readonly applicationDomain: string | null;
  /** Que datos no se pudieron informar. Vacio en una oferta completa. */
  readonly missingFields: readonly PracticeDetailField[];
}
