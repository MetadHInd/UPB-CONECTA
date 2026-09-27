import type { Coordinates, PointOfInterest } from '../../entities/CampusCatalog.js';

/**
 * Lo que el dominio le pide dibujar al proveedor de cartografia. Solo usa
 * tipos del dominio: el proveedor recibe coordenadas y marcadores propios y
 * no aporta ni devuelve datos del catalogo (HU-25 criterio 5).
 */
export interface MapScene {
  readonly campusId: string;
  readonly center: Coordinates;
  readonly markers: readonly PointOfInterest[];
  /** Nivel de edificio que se muestra, si hay uno seleccionado. */
  readonly focus: { readonly buildingId: string; readonly levelId: string } | null;
}

export interface MapProviderPort {
  readonly providerName: string;
  render(scene: MapScene): Promise<void>;
}
