import { MessageCategory } from '../../../classification/domain/value-objects/MessageCategory.js';
import type { DueDate } from '../../../ingestion/domain/value-objects/DueDate.js';
import type { InstitutionalProgramCatalog } from '../../../targeting/domain/ports/out/ProgramCatalogPort.js';
import { FacultyProgramResolver } from '../../../targeting/domain/services/FacultyProgramResolver.js';
import { targetingIncludesProgram } from '../../../targeting/domain/services/ProgramTargetingMembership.js';
import { PRACTICE_MODALITIES, type PracticeModality } from '../entities/PracticeOffer.js';
import {
  DEFAULT_STATUS_FILTER,
  PRACTICE_OFFER_STATUSES,
  type PracticeDetailField,
  type PracticeOfferDetail,
  type PracticeOfferListItem,
  type PracticeOfferStatus,
  type PracticeStatusFilter
} from '../entities/PracticeOfferListing.js';
import type { PracticeConvocatoriaSnapshot } from '../ports/out/PracticeConvocatoriaSourcePort.js';

export interface PracticeListingFilters {
  readonly program: string | null;
  readonly modality: PracticeModality | null;
  readonly status: PracticeStatusFilter;
}

export interface PracticeListingFilterIssue {
  readonly field: 'program' | 'modality' | 'status';
  readonly message: string;
}

export type PracticeListingFiltersParse =
  | { readonly ok: true; readonly value: PracticeListingFilters }
  | { readonly ok: false; readonly issues: readonly PracticeListingFilterIssue[] };

/**
 * Cierre de la oferta (criterio 4). Mismo limite que `evaluateConvocatoriaStatus`
 * (HU-15): vence cuando la fecha es anterior a `now`. Sin fecha o con fecha
 * ambigua no se puede afirmar que cerro, asi que sigue abierta.
 */
export function practiceOfferStatus(dueDate: DueDate, now: Date): PracticeOfferStatus {
  return dueDate.kind === 'con-fecha' && dueDate.date.getTime() < now.getTime() ? 'cerrada' : 'abierta';
}

/**
 * Lo que entra al listado: practicas publicadas y no retiradas. Una oferta
 * retenida para revision (HU-10) o retirada (HU-50) no se muestra, igual que
 * en el feed.
 */
export function isListablePractice(snapshot: PracticeConvocatoriaSnapshot): boolean {
  return (
    snapshot.category === MessageCategory.PRACTICA &&
    snapshot.publicationStatus === 'published' &&
    !snapshot.record.withdrawnAt &&
    !snapshot.details?.withdrawnAt
  );
}

/**
 * Los filtros llegan sin tipo (parametros de consulta). Un valor vacio es un
 * filtro no aplicado; uno desconocido se rechaza indicando el campo, en vez de
 * devolver un listado vacio que parezca "no hay ofertas".
 */
export function parseListingFilters(raw: Readonly<Record<string, unknown>>, catalog: InstitutionalProgramCatalog): PracticeListingFiltersParse {
  const issues: PracticeListingFilterIssue[] = [];
  const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

  const program = text(raw['program']);
  if (program !== null && !catalog.programs.some((candidate) => candidate.id === program)) {
    issues.push({ field: 'program', message: `El programa "${program}" no existe en el catálogo institucional.` });
  }
  const modalityText = text(raw['modality']);
  if (modalityText !== null && !PRACTICE_MODALITIES.includes(modalityText as PracticeModality)) {
    issues.push({ field: 'modality', message: `La modalidad debe ser una de: ${PRACTICE_MODALITIES.join(', ')}.` });
  }
  const statusText = text(raw['status']);
  const validStatuses: readonly string[] = [...PRACTICE_OFFER_STATUSES, 'todas'];
  if (statusText !== null && !validStatuses.includes(statusText)) {
    issues.push({ field: 'status', message: `El estado debe ser uno de: ${validStatuses.join(', ')}.` });
  }
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      program,
      modality: modalityText as PracticeModality | null,
      status: (statusText as PracticeStatusFilter | null) ?? DEFAULT_STATUS_FILTER
    }
  };
}

export function toListItem(snapshot: PracticeConvocatoriaSnapshot, now: Date): PracticeOfferListItem {
  const { record, details } = snapshot;
  return {
    offerId: snapshot.messageId,
    title: record.subject,
    company: details?.company ?? null,
    modality: details?.modality ?? null,
    targeting: snapshot.targeting,
    dueDate: record.dueDate,
    closesAt: record.dueDate.kind === 'con-fecha' ? record.dueDate.date : null,
    status: practiceOfferStatus(record.dueDate, now)
  };
}

export function toDetail(snapshot: PracticeConvocatoriaSnapshot, now: Date): PracticeOfferDetail {
  const item = toListItem(snapshot, now);
  const applicationChannel = snapshot.record.applicationLink;
  const requirements = snapshot.details?.requirements ?? null;
  const missingFields: PracticeDetailField[] = [];
  if (item.company === null) missingFields.push('company');
  if (requirements === null) missingFields.push('requirements');
  if (item.modality === null) missingFields.push('modality');
  if (applicationChannel === null) missingFields.push('applicationChannel');
  return {
    ...item,
    description: snapshot.record.body,
    requirements,
    applicationChannel,
    applicationDomain: applicationChannel ? webDomain(applicationChannel) : null,
    missingFields
  };
}

/**
 * Filtra (criterio 2, combinables) y ordena. Con un filtro de modalidad, una
 * oferta sin modalidad conocida no coincide: no se puede afirmar que lo sea.
 * Orden: vigentes primero por cierre mas proximo (sin fecha al final) y luego
 * las cerradas, la mas reciente primero (criterio 4).
 */
export function selectListing(
  snapshots: readonly PracticeConvocatoriaSnapshot[],
  filters: PracticeListingFilters,
  catalog: InstitutionalProgramCatalog,
  now: Date
): PracticeOfferListItem[] {
  const faculties = new FacultyProgramResolver(catalog);
  return snapshots
    .filter(isListablePractice)
    .map((snapshot) => toListItem(snapshot, now))
    .filter((item) => filters.status === 'todas' || item.status === filters.status)
    .filter((item) => filters.modality === null || item.modality === filters.modality)
    .filter((item) => filters.program === null || targetingIncludesProgram(item.targeting, filters.program, faculties))
    .sort(compareListItems);
}

function compareListItems(a: PracticeOfferListItem, b: PracticeOfferListItem): number {
  if (a.status !== b.status) return a.status === 'abierta' ? -1 : 1;
  const aTime = a.closesAt?.getTime() ?? null;
  const bTime = b.closesAt?.getTime() ?? null;
  if (aTime !== bTime) {
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return a.status === 'abierta' ? aTime - bTime : bTime - aTime;
  }
  return a.offerId.localeCompare(b.offerId);
}

function webDomain(link: string): string | null {
  try {
    const url = new URL(link);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.hostname : null;
  } catch {
    return null;
  }
}
