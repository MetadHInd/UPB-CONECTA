import type { InstitutionalMessage } from '../../domain/entities/InstitutionalMessage.js';
import type { DueDateExtractorPort, DueDateExtraction } from '../../domain/ports/out/DueDateExtractorPort.js';
import type { DueDate } from '../../domain/value-objects/DueDate.js';

/**
 * HU-08 (RF-11, RF-12): interpreta la fecha de cierre y el enlace de
 * postulacion sobre el `body` ya normalizado por HU-02 (texto plano, sin
 * HTML, con los enlaces originales conservados).
 *
 * Vive en infraestructura por el mismo motivo que `MimeMessageNormalizer`
 * (HU-02): es interpretacion de lenguaje natural sobre texto, no una regla
 * de negocio. Sin dependencias nuevas — regex + `Date` nativo, decision de
 * diseño consistente con HU-02.
 */
export class SpanishDueDateExtractor implements DueDateExtractorPort {
  extract(message: InstitutionalMessage): DueDateExtraction {
    const candidates = findDateCandidates(message.body, message.sentAt);
    return {
      dueDate: resolveDueDate(candidates),
      applicationLink: findApplicationLink(message.body)
    };
  }
}

interface DateCandidate {
  readonly date: Date;
  readonly anchored: boolean;
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12
};

// Palabras que anclan una fecha como "la de cierre" y no otra mencion (p. ej. la fecha del evento).
const CLOSING_KEYWORD = /cierr\w*|\bhasta\b|\bplazo\b|venc\w*|l[ií]mite/i;
const ANCHOR_WINDOW = 40; // caracteres alrededor de la fecha en los que se busca la palabra clave

const NUMERIC_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
const TEXTUAL_DATE = /\b(\d{1,2})\s+de\s+([a-zA-Zñáéíóú]+)(?:\s+de\s+(\d{4}))?/gi;

function findDateCandidates(body: string, sentAt: Date): DateCandidate[] {
  const candidates: DateCandidate[] = [];

  for (const match of body.matchAll(NUMERIC_DATE)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = normalizeYear(match[3]);
    const date = buildColombiaDate(day, month, year, sentAt);
    if (date !== null) candidates.push({ date, anchored: isAnchored(body, match.index ?? 0) });
  }

  for (const match of body.matchAll(TEXTUAL_DATE)) {
    const day = Number(match[1]);
    const monthName = match[2]?.toLowerCase() ?? '';
    const month = MONTHS[monthName];
    if (month === undefined) continue;
    const year = match[3] !== undefined ? Number(match[3]) : undefined;
    const date = buildColombiaDate(day, month, year, sentAt);
    if (date !== null) candidates.push({ date, anchored: isAnchored(body, match.index ?? 0) });
  }

  return candidates;
}

/**
 * Solo mira hacia atras: en todos los patrones reales ("Cierre: DATE",
 * "hasta el DATE", "vence el DATE") la palabra clave precede a la fecha.
 * Mirar tambien hacia adelante contaminaria una fecha de una frase anterior
 * con la palabra clave de la frase siguiente (p. ej. "evento el 5 de
 * octubre. Cierre: 20/09/2026" marcaria "5 de octubre" como cierre).
 */
function isAnchored(body: string, matchIndex: number): boolean {
  const start = Math.max(0, matchIndex - ANCHOR_WINDOW);
  return CLOSING_KEYWORD.test(body.slice(start, matchIndex));
}

function normalizeYear(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const year = Number(raw);
  return raw.length === 2 ? 2000 + year : year;
}

/** Medianoche en Colombia (UTC-05:00) representada como instante UTC. */
function buildColombiaDate(day: number, month: number, year: number | undefined, sentAt: Date): Date | null {
  if (!Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const resolvedYear = year ?? sentAt.getUTCFullYear();
  const candidate = new Date(Date.UTC(resolvedYear, month - 1, day, 5, 0, 0));
  if (candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    return null; // fecha invalida, p. ej. 31 de febrero
  }

  // Sin año explicito: si la fecha resultante ya paso respecto al envio, se
  // asume el año siguiente — un aviso de "cierra el 20 de enero" enviado en
  // diciembre se refiere al enero que viene, no al que ya paso.
  if (year === undefined && candidate.getTime() < sentAt.getTime()) {
    return new Date(Date.UTC(resolvedYear + 1, month - 1, day, 5, 0, 0));
  }

  return candidate;
}

function resolveDueDate(candidates: DateCandidate[]): DueDate {
  if (candidates.length === 0) {
    return { kind: 'sin-vencimiento' };
  }

  const anchored = dedupeByTime(candidates.filter((c) => c.anchored));

  if (anchored.length === 1) {
    return { kind: 'con-fecha', date: anchored[0]!.date };
  }
  if (anchored.length > 1) {
    return {
      kind: 'ambigua',
      candidates: anchored.map((c) => c.date),
      reason: 'Varias fechas ancladas a palabras de cierre (cierre/hasta/plazo/vence/limite) no coinciden entre si.'
    };
  }

  // Ninguna fecha esta anclada a una palabra de cierre.
  const all = dedupeByTime(candidates);
  if (all.length === 1) {
    return { kind: 'con-fecha', date: all[0]!.date };
  }
  return {
    kind: 'ambigua',
    candidates: all.map((c) => c.date),
    reason: 'Varias fechas mencionadas en el mensaje, ninguna asociada claramente a un cierre.'
  };
}

function dedupeByTime(candidates: DateCandidate[]): DateCandidate[] {
  const seen = new Map<number, DateCandidate>();
  for (const candidate of candidates) {
    seen.set(candidate.date.getTime(), candidate);
  }
  return [...seen.values()];
}

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;
// Deliberadamente NO incluye "mas informacion": es una frase generica que no
// distingue el enlace de postulacion de un enlace informativo cualquiera.
const APPLICATION_KEYWORD = /postula|postulaci[oó]n|inscr[ií]bete|inscripci[oó]n/i;

function findApplicationLink(body: string): string | null {
  const urls = [...body.matchAll(URL_PATTERN)];
  if (urls.length === 0) return null;
  if (urls.length === 1) return cleanUrl(urls[0]![0]);

  const nearKeyword = urls.find((match) => {
    const start = Math.max(0, (match.index ?? 0) - ANCHOR_WINDOW);
    return APPLICATION_KEYWORD.test(body.slice(start, match.index ?? 0));
  });
  return cleanUrl((nearKeyword ?? urls[0])![0]);
}

/** Quita puntuacion de cierre de frase que el regex de URL captura por error (p. ej. el punto final). */
function cleanUrl(url: string): string {
  return url.replace(TRAILING_PUNCTUATION, '');
}
