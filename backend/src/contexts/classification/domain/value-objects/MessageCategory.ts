export enum MessageCategory {
  CONVOCATORIA_CON_PLAZO = 'convocatoria con plazo',
  EVENTO = 'evento',
  BECA = 'beca',
  MOVILIDAD = 'movilidad',
  CURSO_DE_IDIOMAS = 'curso de idiomas',
  PRACTICA = 'practica',
  BOLETIN_INFORMATIVO = 'boletin informativo'
}

export const MESSAGE_CATEGORIES: readonly MessageCategory[] = Object.values(MessageCategory);

export function isMessageCategory(value: unknown): value is MessageCategory {
  return typeof value === 'string' && MESSAGE_CATEGORIES.includes(value as MessageCategory);
}

export const ClassificationCategory = MessageCategory;
