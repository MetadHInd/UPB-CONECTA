import type { CampusCatalog } from '../../../../domain/entities/CampusCatalog.js';
import type { CampusCatalogRepositoryPort } from '../../../../domain/ports/out/CampusCatalogRepositoryPort.js';
import { assertValidCampusCatalog } from '../../../../domain/services/CampusCatalogValidation.js';

export class InMemoryCampusCatalogRepository implements CampusCatalogRepositoryPort {
  private readonly campuses = new Map<string, CampusCatalog>();

  constructor(catalogs: readonly CampusCatalog[] = []) {
    for (const catalog of catalogs) this.campuses.set(catalog.campusId, assertValidCampusCatalog(catalog));
  }

  async findByCampusId(campusId: string): Promise<CampusCatalog | null> {
    return this.campuses.get(campusId) ?? null;
  }
}
