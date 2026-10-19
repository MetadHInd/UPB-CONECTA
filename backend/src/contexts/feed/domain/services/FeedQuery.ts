import type { DueDate } from '../../../ingestion/domain/value-objects/DueDate.js';
import type { ConvocatoriaEntry } from '../ports/out/ConvocatoriaRepositoryPort.js';

const HOUR_MS = 3_600_000;

/** RF-19: tres niveles segun el tiempo restante al cierre. */
export type UrgencyLevel = 'urgent' | 'soon' | 'relaxed';

/**
 * Menos de 72 horas: `urgent`. Menos de 7 dias: `soon`. Plazo holgado o
 * inexistente (sin vencimiento o fecha ambigua): `relaxed`. Un plazo ya
 * vencido se muestra como `urgent` hasta que el archivado (HU-48) lo retire.
 */
export function urgencyOf(dueDate: DueDate, now: Date): UrgencyLevel {
  if (dueDate.kind !== 'con-fecha') return 'relaxed';
  const remaining = dueDate.date.getTime() - now.getTime();
  if (remaining < 72 * HOUR_MS) return 'urgent';
  if (remaining < 7 * 24 * HOUR_MS) return 'soon';
  return 'relaxed';
}

/**
 * RF-18: primero las convocatorias con plazo, de la mas proxima a la mas
 * lejana; despues las demas (sin plazo o con fecha ambigua) por fecha de
 * publicacion descendente. Estable y sin mutar la entrada.
 */
export function orderByDeadline<T extends Pick<ConvocatoriaEntry, 'record'>>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    const dueA = a.record.dueDate;
    const dueB = b.record.dueDate;
    if (dueA.kind === 'con-fecha' && dueB.kind === 'con-fecha') return dueA.date.getTime() - dueB.date.getTime();
    if (dueA.kind === 'con-fecha') return -1;
    if (dueB.kind === 'con-fecha') return 1;
    return b.record.lastSentAt.getTime() - a.record.lastSentAt.getTime();
  });
}

/** Minusculas y sin tildes, para que buscar "matricula" encuentre "Matrícula". */
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * RF-21: todos los terminos de la consulta deben aparecer en el asunto o en el
 * cuerpo. Una consulta vacia no filtra.
 */
export function matchesText(record: { readonly subject: string; readonly body: string }, query: string): boolean {
  const terms = normalizeSearchText(query).split(/\s+/).filter((term) => term !== '');
  if (terms.length === 0) return true;
  const haystack = normalizeSearchText(`${record.subject}\n${record.body}`);
  return terms.every((term) => haystack.includes(term));
}
