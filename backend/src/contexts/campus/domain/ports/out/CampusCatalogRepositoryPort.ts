import type { CampusCatalog } from '../../entities/CampusCatalog.js';

/** Catalogo de espacios propio. Independiente del proveedor de cartografia. */
export interface CampusCatalogRepositoryPort {
  /** `null` si el campus no esta en el catalogo. */
  findByCampusId(campusId: string): Promise<CampusCatalog | null>;
}
