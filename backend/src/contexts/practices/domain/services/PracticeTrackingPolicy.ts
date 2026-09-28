import {
  PRACTICE_APPLICATION_STATUSES,
  type PracticeApplicationStatus,
  type PracticeApplicationStatusChange,
  type PracticeApplicationTracking
} from '../entities/PracticeApplicationTracking.js';
import type { PracticeConvocatoriaSnapshot } from '../ports/out/PracticeConvocatoriaSourcePort.js';
import { isListablePractice, practiceOfferStatus } from './PracticeListingPolicy.js';

/**
 * Como esta hoy la oferta que el estudiante sigue. `retirada` y
 * `no-disponible` existen para el criterio 6: la oferta no desaparece del
 * seguimiento, se explica que paso.
 */
export type TrackedOfferSituation = 'abierta' | 'cerrada' | 'retirada' | 'no-disponible';

export interface TrackedPracticeApplication {
  readonly offerId: string;
  readonly offerTitle: string;
  readonly company: string | null;
  readonly status: PracticeApplicationStatus;
  readonly history: readonly PracticeApplicationStatusChange[];
  readonly updatedAt: Date;
  readonly situation: TrackedOfferSituation;
  readonly closesAt: Date | null;
  readonly withdrawnAt: Date | null;
  /** Explicacion para el estudiante cuando la oferta cambio sin que el lo hiciera; `null` si sigue publicada. */
  readonly notice: string | null;
}

export interface PracticeApplicationGroup {
  readonly status: PracticeApplicationStatus;
  readonly applications: readonly TrackedPracticeApplication[];
}

export const WITHDRAWN_NOTICE =
  'La Universidad retiró esta oferta: ya no está publicada y no recibirás recordatorios de su cierre. Tu seguimiento se conserva.';
export const UNAVAILABLE_NOTICE =
  'Esta oferta ya no está disponible en la oferta de prácticas. Tu seguimiento se conserva.';

export type PracticeApplicationStatusParse =
  | { readonly ok: true; readonly value: PracticeApplicationStatus }
  | { readonly ok: false; readonly message: string };

/** Criterio 1: el estado llega sin tipo desde el cliente y solo admite los cuatro del catalogo. */
export function parseApplicationStatus(raw: unknown): PracticeApplicationStatusParse {
  if (typeof raw === 'string' && PRACTICE_APPLICATION_STATUSES.includes(raw as PracticeApplicationStatus)) {
    return { ok: true, value: raw as PracticeApplicationStatus };
  }
  return { ok: false, message: `El estado debe ser uno de: ${PRACTICE_APPLICATION_STATUSES.join(', ')}.` };
}

/**
 * Situacion de la oferta seguida. Retirada tiene prioridad sobre todo lo
 * demas: es lo que el estudiante necesita saber. Una oferta que dejo de
 * figurar como practica (reclasificada, archivada por retencion) o que volvio
 * a revision queda como no disponible, sin inventar el motivo.
 */
export function trackedOfferSituation(
  snapshot: PracticeConvocatoriaSnapshot | undefined,
  now: Date
): { readonly situation: TrackedOfferSituation; readonly closesAt: Date | null; readonly withdrawnAt: Date | null } {
  if (snapshot === undefined) return { situation: 'no-disponible', closesAt: null, withdrawnAt: null };
  const { record, details } = snapshot;
  const closesAt = record.dueDate.kind === 'con-fecha' ? record.dueDate.date : null;
  const withdrawnAt = record.withdrawnAt ?? details?.withdrawnAt ?? null;
  if (withdrawnAt !== null) return { situation: 'retirada', closesAt, withdrawnAt };
  if (!isListablePractice(snapshot)) return { situation: 'no-disponible', closesAt, withdrawnAt: null };
  return { situation: practiceOfferStatus(record.dueDate, now), closesAt, withdrawnAt: null };
}

function noticeFor(situation: TrackedOfferSituation): string | null {
  if (situation === 'retirada') return WITHDRAWN_NOTICE;
  if (situation === 'no-disponible') return UNAVAILABLE_NOTICE;
  return null;
}

/**
 * Vista de seguimiento (criterio 5): siempre los cuatro grupos, en el orden
 * del avance, aunque alguno este vacio, para que el cliente no tenga que
 * adivinar cuales existen. Dentro de cada grupo, lo actualizado mas
 * recientemente primero.
 */
export function groupTrackedApplications(
  trackings: readonly PracticeApplicationTracking[],
  snapshots: ReadonlyMap<string, PracticeConvocatoriaSnapshot>,
  now: Date
): PracticeApplicationGroup[] {
  const tracked = trackings.map((tracking): TrackedPracticeApplication => {
    const offer = trackedOfferSituation(snapshots.get(tracking.offerId), now);
    return {
      offerId: tracking.offerId,
      offerTitle: tracking.offerTitle,
      company: tracking.company,
      status: tracking.status,
      history: tracking.history,
      updatedAt: tracking.updatedAt,
      ...offer,
      notice: noticeFor(offer.situation)
    };
  });
  return PRACTICE_APPLICATION_STATUSES.map((status) => ({
    status,
    applications: tracked
      .filter((application) => application.status === status)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.offerId.localeCompare(b.offerId))
  }));
}
