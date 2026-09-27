import type { CampusCatalog, Coordinates } from '../entities/CampusCatalog.js';
import { isPoiCategory } from '../value-objects/PoiCategory.js';

export class InvalidCampusCatalogError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Catalogo de campus invalido: ${issues.join(' ')}`);
    this.name = 'InvalidCampusCatalogError';
  }
}

function validCoordinates(c: Coordinates): boolean {
  return (
    Number.isFinite(c.latitude) && Number.isFinite(c.longitude) &&
    c.latitude >= -90 && c.latitude <= 90 && c.longitude >= -180 && c.longitude <= 180
  );
}

/**
 * Integridad del catalogo: identificadores unicos, coordenadas validas,
 * edificios con al menos un nivel y puntos de interes que apuntan a
 * edificios y niveles que existen. Lanza `InvalidCampusCatalogError` con
 * todos los problemas a la vez.
 */
export function assertValidCampusCatalog(catalog: CampusCatalog): CampusCatalog {
  const issues: string[] = [];
  const seen = new Set<string>();
  const unique = (kind: string, id: string): void => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) issues.push(`Identificador de ${kind} repetido: "${id}".`);
    seen.add(key);
  };
  const levelsByBuilding = new Map<string, Set<string>>();

  if (!validCoordinates(catalog.center)) issues.push('El centro del campus tiene coordenadas invalidas.');
  for (const block of catalog.blocks) {
    unique('bloque', block.id);
    for (const building of block.buildings) {
      unique('edificio', building.id);
      if (!validCoordinates(building.coordinates)) issues.push(`El edificio "${building.id}" tiene coordenadas invalidas.`);
      if (building.levels.length === 0) issues.push(`El edificio "${building.id}" no tiene niveles.`);
      const levelIds = new Set<string>();
      for (const level of building.levels) {
        unique('nivel', `${building.id}/${level.id}`);
        levelIds.add(level.id);
      }
      levelsByBuilding.set(building.id, levelIds);
    }
  }
  for (const poi of catalog.pointsOfInterest) {
    unique('punto de interes', poi.id);
    if (!isPoiCategory(poi.category)) issues.push(`El punto "${poi.id}" tiene una categoria desconocida.`);
    if (!validCoordinates(poi.coordinates)) issues.push(`El punto "${poi.id}" tiene coordenadas invalidas.`);
    if (poi.buildingId === null) {
      if (poi.levelId !== null) issues.push(`El punto "${poi.id}" tiene nivel pero no edificio.`);
      continue;
    }
    const levels = levelsByBuilding.get(poi.buildingId);
    if (levels === undefined) issues.push(`El punto "${poi.id}" apunta a un edificio inexistente ("${poi.buildingId}").`);
    else if (poi.levelId === null || !levels.has(poi.levelId)) {
      issues.push(`El punto "${poi.id}" debe indicar un nivel existente del edificio "${poi.buildingId}".`);
    }
  }
  if (issues.length > 0) throw new InvalidCampusCatalogError(issues);
  return catalog;
}
