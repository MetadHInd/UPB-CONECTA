import type { PracticeConvocatoriaSnapshot } from '../ports/out/PracticeConvocatoriaSourcePort.js';
import { isListablePractice } from './PracticeListingPolicy.js';

/** Reglas de duplicado como datos (`config/practice-listing-policy.json`). */
export interface PracticeDuplicateRules {
  /** Parametros de enlace que solo rastrean la campana y no identifican la oferta. */
  readonly trackingQueryParams: readonly string[];
  readonly trackingQueryParamPrefixes: readonly string[];
  /** Sufijos legales que no distinguen una empresa de otra ("S.A.S.", "Ltda"). */
  readonly companyLegalSuffixes: readonly string[];
  /** Dos ofertas de la misma empresa cuyo cierre difiere menos que esto se consideran la misma. */
  readonly companyMatchWindowHours: number;
}

export interface DuplicateCandidate {
  readonly company: string;
  readonly applicationChannel: string;
  readonly dueDate: Date;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Forma comparable de un canal de postulacion: mismo enlace escrito distinto
 * (mayusculas en el dominio, barra final, fragmento, parametros de campana,
 * puerto por defecto, `mailto:`) da la misma cadena. `null` si no hay canal
 * o no se puede interpretar.
 */
export function canonicalApplicationChannel(channel: string | null, rules: PracticeDuplicateRules): string | null {
  const text = channel?.trim() ?? '';
  if (text === '') return null;
  if (/^mailto:/i.test(text)) return `mailto:${text.slice('mailto:'.length).trim().toLowerCase()}`;
  if (EMAIL.test(text)) return `mailto:${text.toLowerCase()}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const kept = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name.toLowerCase(), rules))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = new URLSearchParams(kept).toString();
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  return `${url.protocol}//${url.host}${path}${query === '' ? '' : `?${query}`}`;
}

function isTrackingParam(name: string, rules: PracticeDuplicateRules): boolean {
  return rules.trackingQueryParams.includes(name) || rules.trackingQueryParamPrefixes.some((prefix) => name.startsWith(prefix));
}

/** Empresa comparable: sin tildes, mayusculas, puntuacion ni sufijo legal. */
export function normalizeCompanyName(company: string, rules: PracticeDuplicateRules): string {
  const words = company
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word !== '');
  while (words.length > 1 && rules.companyLegalSuffixes.includes(words[words.length - 1]!)) words.pop();
  return words.join(' ');
}

/**
 * HU-22, criterio 5: la oferta que se esta cargando a mano, ¿ya esta
 * registrada? Dos reglas, de la mas a la menos fuerte:
 * 1. el mismo canal de postulacion (la unica pista que comparte una oferta
 *    ingerida, que no trae empresa);
 * 2. la misma empresa con cierre dentro de la ventana configurada (dos cargas
 *    a mano de la misma oferta con otro enlace).
 * Solo cuentan las ofertas listables: una retirada no absorbe una carga nueva.
 * Entre varias coincidencias gana la primera publicada.
 */
export function findDuplicateOffer(
  candidate: DuplicateCandidate,
  snapshots: readonly PracticeConvocatoriaSnapshot[],
  rules: PracticeDuplicateRules
): PracticeConvocatoriaSnapshot | null {
  const live = snapshots.filter(isListablePractice);
  const channel = canonicalApplicationChannel(candidate.applicationChannel, rules);
  const company = normalizeCompanyName(candidate.company, rules);
  const windowMs = rules.companyMatchWindowHours * 3_600_000;

  const byChannel = live.filter((snapshot) => channel !== null && canonicalApplicationChannel(snapshot.record.applicationLink, rules) === channel);
  const byCompany = live.filter((snapshot) => {
    const { details, record } = snapshot;
    if (details === null || record.dueDate.kind !== 'con-fecha') return false;
    return (
      normalizeCompanyName(details.company, rules) === company &&
      Math.abs(record.dueDate.date.getTime() - candidate.dueDate.getTime()) < windowMs
    );
  });
  return firstPublished(byChannel) ?? firstPublished(byCompany);
}

function firstPublished(snapshots: readonly PracticeConvocatoriaSnapshot[]): PracticeConvocatoriaSnapshot | null {
  return [...snapshots].sort((a, b) => a.record.firstSentAt.getTime() - b.record.firstSentAt.getTime())[0] ?? null;
}
