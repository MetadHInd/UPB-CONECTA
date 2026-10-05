import { normalizeCatalogText } from '../../../targeting/domain/services/CatalogTextNormalization.js';
import type { ProgramTargeting } from '../../../targeting/domain/value-objects/ProgramTargeting.js';

export type TopicStatus = 'active' | 'retired';

/**
 * Tema del foro (HU-30 criterios 3, 4 y 5). Es un dato administrable, no un
 * enum: el catalogo crece con `ManageTopics` sin tocar codigo. `restriction`
 * reutiliza `ProgramTargeting` de `targeting` (toda la comunidad, una
 * facultad o un conjunto de programas) para no reinventar esa semantica.
 * Retirar un tema no borra sus publicaciones.
 */
export interface Topic {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly restriction: ProgramTargeting;
  readonly status: TopicStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Quien hizo el ultimo cambio; lo provee el control de acceso administrativo (fuera de alcance). */
  readonly updatedBy: string;
}

export const TOPIC_LIMITS = { nameMax: 80, descriptionMax: 500 } as const;

export class InvalidTopicError extends Error {
  constructor(motivo: string) {
    super(`Tema invalido: ${motivo}`);
    this.name = 'InvalidTopicError';
  }
}

export function validateTopicText(name: string, description: string): { name: string; description: string } {
  const cleanName = name.trim();
  const cleanDescription = description.trim();
  if (cleanName === '') throw new InvalidTopicError('el nombre no puede estar vacio');
  if (cleanName.length > TOPIC_LIMITS.nameMax) {
    throw new InvalidTopicError(`el nombre admite hasta ${TOPIC_LIMITS.nameMax} caracteres`);
  }
  if (cleanDescription.length > TOPIC_LIMITS.descriptionMax) {
    throw new InvalidTopicError(`la descripcion admite hasta ${TOPIC_LIMITS.descriptionMax} caracteres`);
  }
  return { name: cleanName, description: cleanDescription };
}

/** Id estable derivado del nombre al crear ("Semilleros de Sistemas" -> "semilleros-de-sistemas"). */
export function topicIdFromName(name: string): string {
  return normalizeCatalogText(name).replace(/ /g, '-');
}

export function isTopicRestricted(topic: Topic): boolean {
  return topic.restriction.kind !== 'all-community';
}
