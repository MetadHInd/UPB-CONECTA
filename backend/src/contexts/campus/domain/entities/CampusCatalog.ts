import type { PoiCategory } from '../value-objects/PoiCategory.js';

/** Coordenadas WGS84 en grados. Son del catalogo propio, no de una capa del proveedor. */
export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

/** Nivel (piso) de un edificio. 0 es planta baja; los negativos son sotanos. */
export interface BuildingLevel {
  readonly id: string;
  readonly number: number;
  readonly name: string;
}

export interface CampusBuilding {
  readonly id: string;
  readonly name: string;
  readonly coordinates: Coordinates;
  readonly levels: readonly BuildingLevel[];
}

export interface CampusBlock {
  readonly id: string;
  readonly name: string;
  readonly buildings: readonly CampusBuilding[];
}

/**
 * Punto de interes. Si esta dentro de un edificio lleva `buildingId` y
 * `levelId` (que debe ser un nivel de ese edificio); al aire libre (por
 * ejemplo un parqueadero) no lleva ninguno de los dos.
 */
export interface PointOfInterest {
  readonly id: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly coordinates: Coordinates;
  readonly buildingId: string | null;
  readonly levelId: string | null;
}

/**
 * Catalogo de espacios del campus (HU-25): agregado propio del dominio.
 * Cambiar de proveedor de cartografia no lo toca (criterio 5).
 */
export interface CampusCatalog {
  readonly campusId: string;
  readonly name: string;
  readonly center: Coordinates;
  readonly blocks: readonly CampusBlock[];
  readonly pointsOfInterest: readonly PointOfInterest[];
}
