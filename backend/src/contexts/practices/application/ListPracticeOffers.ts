import type { InstitutionalProgramCatalog } from '../../targeting/domain/ports/out/ProgramCatalogPort.js';
import type { PracticeOfferListItem } from '../domain/entities/PracticeOfferListing.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { PracticeConvocatoriaSourcePort } from '../domain/ports/out/PracticeConvocatoriaSourcePort.js';
import {
  parseListingFilters,
  selectListing,
  type PracticeListingFilterIssue,
  type PracticeListingFilters
} from '../domain/services/PracticeListingPolicy.js';

export type ListPracticeOffersResult =
  | { readonly ok: true; readonly offers: readonly PracticeOfferListItem[]; readonly appliedFilters: PracticeListingFilters }
  | { readonly ok: false; readonly message: string; readonly issues: readonly PracticeListingFilterIssue[] };

/**
 * HU-22 (RF-31, RF-32): listado unico de la oferta de practicas, con filtros
 * por programa, modalidad y estado que se combinan (criterios 1, 2 y 4).
 *
 * Lee una sola fuente (`PracticeConvocatoriaSourcePort`) que no distingue si
 * la oferta llego por correo o se cargo a mano: el modelo de lectura no tiene
 * campo de origen. Por defecto solo lista las abiertas; las cerradas salen
 * con `status: 'cerrada'` o `'todas'`, nunca mezcladas por omision.
 *
 * Operacion de lectura para el estudiante: no es administrativa, asi que no
 * figura en `config/protected-operations.json`.
 */
export class ListPracticeOffers {
  constructor(
    private readonly dependencies: {
      readonly source: PracticeConvocatoriaSourcePort;
      readonly catalog: InstitutionalProgramCatalog;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(rawFilters: Readonly<Record<string, unknown>> = {}): Promise<ListPracticeOffersResult> {
    const { source, catalog, clock } = this.dependencies;
    const parsed = parseListingFilters(rawFilters, catalog);
    if (!parsed.ok) {
      return { ok: false, message: `Filtros inválidos. ${parsed.issues.map((issue) => issue.message).join(' ')}`, issues: parsed.issues };
    }
    const snapshots = await source.findPracticeConvocatorias();
    return { ok: true, offers: selectListing(snapshots, parsed.value, catalog, clock.now()), appliedFilters: parsed.value };
  }
}
