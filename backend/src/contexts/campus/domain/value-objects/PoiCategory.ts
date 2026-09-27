/**
 * Categorias de punto de interes filtrables (HU-25 criterio 3). Los valores
 * son el vocabulario del dominio, no del proveedor de cartografia.
 */
export enum PoiCategory {
  CAFETERIA = 'cafeteria',
  LIBRARY = 'biblioteca',
  WELLBEING = 'bienestar',
  COORDINATION = 'coordinacion',
  SERVICE_POINT = 'punto-de-atencion',
  PARKING = 'parqueadero',
  RESTROOM = 'servicio-sanitario'
}

export const ALL_POI_CATEGORIES: readonly PoiCategory[] = Object.values(PoiCategory);

export function isPoiCategory(value: unknown): value is PoiCategory {
  return typeof value === 'string' && (ALL_POI_CATEGORIES as readonly string[]).includes(value);
}
