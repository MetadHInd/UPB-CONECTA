import type { PointOfInterest } from '../domain/entities/CampusCatalog.js';
import type { CampusCatalogRepositoryPort } from '../domain/ports/out/CampusCatalogRepositoryPort.js';
import type { MapProviderPort } from '../domain/ports/out/MapProviderPort.js';
import type { PoiCategory } from '../domain/value-objects/PoiCategory.js';
import { filterPointsOfInterest } from '../domain/services/PointOfInterestFilter.js';
import { campusFailure, CampusFailureKind, isFailure, parseCategories, type CampusFailure } from './CampusResults.js';

export type FilterPointsOfInterestResult =
  | { readonly ok: true; readonly visibleCategories: readonly PoiCategory[]; readonly pointsOfInterest: readonly PointOfInterest[] }
  | CampusFailure;

/**
 * Mostrar u ocultar categorias (HU-25 criterio 3). El cliente envia las
 * categorias que quiere ver; las demas quedan ocultas. La escena se vuelve
 * a pedir al proveedor con solo esos marcadores.
 */
export class FilterPointsOfInterest {
  constructor(
    private readonly dependencies: {
      readonly catalog: CampusCatalogRepositoryPort;
      readonly mapProvider: MapProviderPort;
    }
  ) {}

  async execute(input: { readonly campusId: string; readonly visibleCategories: readonly string[] }): Promise<FilterPointsOfInterestResult> {
    const { catalog, mapProvider } = this.dependencies;
    const campus = await catalog.findByCampusId(input.campusId);
    if (campus === null) return campusFailure(CampusFailureKind.CAMPUS_NOT_FOUND, `No existe el campus "${input.campusId}".`);
    const visibleCategories = parseCategories(input.visibleCategories);
    if (isFailure(visibleCategories)) return visibleCategories;

    const pointsOfInterest = filterPointsOfInterest(campus.pointsOfInterest, { visibleCategories });
    await mapProvider.render({ campusId: campus.campusId, center: campus.center, markers: pointsOfInterest, focus: null });
    return { ok: true, visibleCategories, pointsOfInterest };
  }
}
