import { ALL_POI_CATEGORIES, isPoiCategory, type PoiCategory } from '../domain/value-objects/PoiCategory.js';

export enum CampusFailureKind {
  CAMPUS_NOT_FOUND = 'campus-not-found',
  BUILDING_NOT_FOUND = 'building-not-found',
  LEVEL_NOT_FOUND = 'level-not-found',
  UNKNOWN_CATEGORY = 'unknown-category'
}

export type CampusFailure = {
  readonly ok: false;
  readonly error: CampusFailureKind;
  readonly message: string;
};

export function campusFailure(error: CampusFailureKind, message: string): CampusFailure {
  return { ok: false, error, message };
}

/** Las categorias llegan del cliente como texto: se validan contra el vocabulario del dominio. Ausente: todas. */
export function parseCategories(raw: readonly string[] | undefined): readonly PoiCategory[] | CampusFailure {
  if (raw === undefined) return ALL_POI_CATEGORIES;
  const unknown = raw.filter((value) => !isPoiCategory(value));
  if (unknown.length > 0) {
    return campusFailure(CampusFailureKind.UNKNOWN_CATEGORY, `Categoria desconocida: ${unknown.join(', ')}.`);
  }
  return raw as readonly PoiCategory[];
}

export function isFailure(value: readonly PoiCategory[] | CampusFailure): value is CampusFailure {
  return !Array.isArray(value);
}
