import type { MessageCategory } from '../../../../classification/domain/value-objects/MessageCategory.js';
import type { PublicationStatus } from '../../../../classification/domain/entities/ClassificationResult.js';
import type { ConsolidatedMessageRecord } from '../../../../ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { ProgramTargeting } from '../../../../targeting/domain/value-objects/ProgramTargeting.js';
import type { PracticeOfferDetails } from '../../entities/PracticeOffer.js';

/**
 * Una convocatoria de practica tal como la ven el listado y el detalle de
 * HU-22: el registro consolidado (ingestion) junto con su clasificacion,
 * su segmentacion y, si existe, lo propio de la practica (`practice_offers`).
 *
 * `details` es `null` para una oferta que llego por la ingesta y nadie ha
 * completado: la ingesta aun no extrae empresa, requisitos ni modalidad
 * (ver README). El modelo de lectura lo declara, no lo oculta.
 */
export interface PracticeConvocatoriaSnapshot {
  readonly messageId: string;
  readonly record: ConsolidatedMessageRecord;
  readonly category: MessageCategory;
  readonly publicationStatus: PublicationStatus;
  readonly targeting: ProgramTargeting;
  readonly details: PracticeOfferDetails | null;
}

/**
 * Fuente unica de la oferta de practicas, sin distinguir el origen: lo que
 * llego por correo y lo cargado a mano viven en los mismos repositorios
 * (HU-24 publica a traves de `PublishConvocatoria`).
 *
 * Devuelve las convocatorias cuya categoria final es practica; el filtrado
 * por retiro y por estado de publicacion lo aplica el dominio
 * (`isListablePractice`), para que esa regla quede probada en un solo sitio.
 */
export interface PracticeConvocatoriaSourcePort {
  findPracticeConvocatorias(): Promise<readonly PracticeConvocatoriaSnapshot[]>;
  /** Una sola, por `representativeMessageId`, para el detalle; `null` si no existe o no es una practica. */
  findPracticeConvocatoria(messageId: string): Promise<PracticeConvocatoriaSnapshot | null>;
}
