import type { BuildingLevel, PointOfInterest } from '../domain/entities/CampusCatalog.js';
import type { CampusCatalogRepositoryPort } from '../domain/ports/out/CampusCatalogRepositoryPort.js';
import type { MapProviderPort } from '../domain/ports/out/MapProviderPort.js';
import { filterPointsOfInterest } from '../domain/services/PointOfInterestFilter.js';
import { campusFailure, CampusFailureKind, isFailure, parseCategories, type CampusFailure } from './CampusResults.js';

export type SelectBuildingLevelResult =
  | {
      readonly ok: true;
      readonly buildingId: string;
      readonly level: BuildingLevel;
      /** Todos los niveles del edificio, de menor a mayor, para alternar entre ellos. */
      readonly levels: readonly BuildingLevel[];
      /** Falso si el edificio tiene un solo nivel: no hay nada que alternar. */
      readonly canSwitchLevel: boolean;
      readonly pointsOfInterest: readonly PointOfInterest[];
    }
  | CampusFailure;

/**
 * Alternar entre niveles de un edificio (HU-25 criterio 4). Sin `levelId`
 * muestra el nivel mas bajo. Devuelve los puntos de interes de ese nivel
 * (respetando las categorias visibles) y pide al proveedor la escena
 * enfocada en el.
 */
export class SelectBuildingLevel {
  constructor(
    private readonly dependencies: {
      readonly catalog: CampusCatalogRepositoryPort;
      readonly mapProvider: MapProviderPort;
    }
  ) {}

  async execute(input: {
    readonly campusId: string;
    readonly buildingId: string;
    readonly levelId?: string;
    readonly visibleCategories?: readonly string[];
  }): Promise<SelectBuildingLevelResult> {
    const { catalog, mapProvider } = this.dependencies;
    const campus = await catalog.findByCampusId(input.campusId);
    if (campus === null) return campusFailure(CampusFailureKind.CAMPUS_NOT_FOUND, `No existe el campus "${input.campusId}".`);

    const building = campus.blocks.flatMap((block) => block.buildings).find((b) => b.id === input.buildingId);
    if (building === undefined) {
      return campusFailure(CampusFailureKind.BUILDING_NOT_FOUND, `No existe el edificio "${input.buildingId}".`);
    }
    const levels = [...building.levels].sort((a, b) => a.number - b.number);
    const level = input.levelId === undefined ? levels[0] : levels.find((l) => l.id === input.levelId);
    if (level === undefined) {
      return campusFailure(CampusFailureKind.LEVEL_NOT_FOUND, `El edificio "${building.id}" no tiene el nivel "${input.levelId}".`);
    }
    const visibleCategories = parseCategories(input.visibleCategories);
    if (isFailure(visibleCategories)) return visibleCategories;

    const pointsOfInterest = filterPointsOfInterest(campus.pointsOfInterest, {
      visibleCategories,
      buildingId: building.id,
      levelId: level.id
    });
    await mapProvider.render({
      campusId: campus.campusId,
      center: building.coordinates,
      markers: pointsOfInterest,
      focus: { buildingId: building.id, levelId: level.id }
    });
    return { ok: true, buildingId: building.id, level, levels, canSwitchLevel: levels.length > 1, pointsOfInterest };
  }
}
