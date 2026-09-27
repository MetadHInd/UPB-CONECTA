import type { PointOfInterest } from '../entities/CampusCatalog.js';
import type { PoiCategory } from '../value-objects/PoiCategory.js';

export interface PointOfInterestCriteria {
  /** Categorias visibles. Ausente: todas. Vacio: ninguna (todo oculto). */
  readonly visibleCategories?: readonly PoiCategory[];
  readonly buildingId?: string;
  readonly levelId?: string;
}

/** Filtra por categoria visible y, opcionalmente, por edificio y nivel (HU-25 criterios 3 y 4). */
export function filterPointsOfInterest(
  points: readonly PointOfInterest[],
  criteria: PointOfInterestCriteria
): readonly PointOfInterest[] {
  const visible = criteria.visibleCategories === undefined ? null : new Set(criteria.visibleCategories);
  return points.filter(
    (poi) =>
      (visible === null || visible.has(poi.category)) &&
      (criteria.buildingId === undefined || poi.buildingId === criteria.buildingId) &&
      (criteria.levelId === undefined || poi.levelId === criteria.levelId)
  );
}
