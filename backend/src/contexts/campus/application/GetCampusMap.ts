import type { CampusBlock, Coordinates, PointOfInterest } from '../domain/entities/CampusCatalog.js';
import type { CampusCatalogRepositoryPort } from '../domain/ports/out/CampusCatalogRepositoryPort.js';
import type { MapProviderPort } from '../domain/ports/out/MapProviderPort.js';
import { ALL_POI_CATEGORIES, type PoiCategory } from '../domain/value-objects/PoiCategory.js';
import { filterPointsOfInterest } from '../domain/services/PointOfInterestFilter.js';
import { campusFailure, CampusFailureKind, isFailure, parseCategories, type CampusFailure } from './CampusResults.js';

export type GetCampusMapResult =
  | {
      readonly ok: true;
      readonly campusId: string;
      readonly name: string;
      readonly center: Coordinates;
      readonly blocks: readonly CampusBlock[];
      readonly categories: readonly PoiCategory[];
      readonly visibleCategories: readonly PoiCategory[];
      readonly pointsOfInterest: readonly PointOfInterest[];
    }
  | CampusFailure;

/**
 * Carga del modulo de mapa (HU-25 criterios 1 y 3): el campus con sus
 * bloques, edificios y niveles, y los puntos de interes de las categorias
 * visibles (todas si no se indica). Luego le pide al proveedor de
 * cartografia que dibuje la escena (criterio 5): el proveedor es
 * reemplazable y el catalogo sale siempre del repositorio propio.
 */
export class GetCampusMap {
  constructor(
    private readonly dependencies: {
      readonly catalog: CampusCatalogRepositoryPort;
      readonly mapProvider: MapProviderPort;
    }
  ) {}

  async execute(input: { readonly campusId: string; readonly visibleCategories?: readonly string[] }): Promise<GetCampusMapResult> {
    const { catalog, mapProvider } = this.dependencies;
    const campus = await catalog.findByCampusId(input.campusId);
    if (campus === null) return campusFailure(CampusFailureKind.CAMPUS_NOT_FOUND, `No existe el campus "${input.campusId}".`);

    const visibleCategories = parseCategories(input.visibleCategories);
    if (isFailure(visibleCategories)) return visibleCategories;

    const pointsOfInterest = filterPointsOfInterest(campus.pointsOfInterest, { visibleCategories });
    await mapProvider.render({ campusId: campus.campusId, center: campus.center, markers: pointsOfInterest, focus: null });
    return {
      ok: true,
      campusId: campus.campusId,
      name: campus.name,
      center: campus.center,
      blocks: campus.blocks,
      categories: ALL_POI_CATEGORIES,
      visibleCategories,
      pointsOfInterest
    };
  }
}
