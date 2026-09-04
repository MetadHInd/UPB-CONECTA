import type { RawInstitutionalMessage } from '../../domain/entities/RawInstitutionalMessage.js';
import type { InstitutionalAttachment, InstitutionalMessage } from '../../domain/entities/InstitutionalMessage.js';

/**
 * HU-02: traduccion tecnica de un RawInstitutionalMessage a InstitutionalMessage.
 *
 * Vive en infraestructura, no en dominio, porque todo lo que hace aqui dentro
 * es analisis de formato de correo (MIME, HTML, juegos de caracteres) — nada
 * de esto decide que constituye una convocatoria ni a que programa pertenece.
 * Esa frontera (ACL, revision de literatura seccion 5.2) es la que separa esta
 * historia de la clasificacion (HU-06 en adelante).
 */
export function normalizeInstitutionalMessage(raw: RawInstitutionalMessage): InstitutionalMessage {
  const { headers, body } = splitHeadersAndBody(raw.rawBody);
  const leaves: MimeLeaf[] = [];
  collectLeaves(headers, body, leaves);

  if (leaves.length === 0) {
    leaves.push(buildFallbackLeaf(headers, body, raw.rawBody));
  }

  const attachments: InstitutionalAttachment[] = [];
  const textLeaves: { type: string; text: string }[] = [];

  for (const leaf of leaves) {
    if (isAttachmentLeaf(leaf)) {
      attachments.push({ filename: leaf.filename, contentType: leaf.contentType, approxSizeBytes: leaf.bytes.length });
      continue;
    }
    if (leaf.contentType.startsWith('text/')) {
      textLeaves.push({ type: leaf.contentType, text: decodeText(leaf.bytes, leaf.params['charset']) });
    }
  }

  const plainPart = textLeaves.find((part) => part.type === 'text/plain');
  const htmlPart = textLeaves.find((part) => part.type === 'text/html');
  const extracted = plainPart ? plainPart.text : htmlPart ? htmlToPlainText(htmlPart.text) : '';
  const normalizedBody = stripTrailingBlocks(extracted);

  const recipients = deduplicate([...parseAddressList(headers.get('to')), ...parseAddressList(headers.get('cc'))]);
  const sentAt = resolveSentAt(headers.get('date'), raw.receivedAt);
  const subjectHeader = headers.get('subject');
  const subject = subjectHeader !== undefined ? decodeEncodedWords(subjectHeader) : raw.subject;
  const sender = extractEmailAddress(headers.get('from') ?? '') ?? raw.sender;

  return {
    messageId: raw.messageId,
    mailboxUid: raw.mailboxUid,
    sender,
    subject,
    sentAt,
    recipients,
    body: normalizedBody,
    attachments
  };
}

// --- Estructura MIME -------------------------------------------------------

interface MimeLeaf {
  readonly contentType: string;
  readonly params: Readonly<Record<string, string>>;
  readonly disposition: string | null;
  readonly filename: string | null;
  readonly bytes: Uint8Array;
}

function splitHeadersAndBody(raw: string): { headers: Map<string, string>; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n');
  const separatorIndex = normalized.indexOf('\n\n');
  if (separatorIndex === -1) {
    return { headers: parseHeaderBlock(normalized), body: '' };
  }
  return { headers: parseHeaderBlock(normalized.slice(0, separatorIndex)), body: normalized.slice(separatorIndex + 2) };
}

function parseHeaderBlock(block: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = block.replace(/\n[ \t]+/g, ' ');
  for (const line of unfolded.split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name.length === 0) continue;
    headers.set(name, value);
  }
  return headers;
}

function parseHeaderValueParams(value: string | undefined): { type: string; params: Record<string, string> } {
  if (!value) return { type: '', params: {} };
  const [typePart, ...paramParts] = value.split(';');
  const type = (typePart ?? '').trim().toLowerCase();
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    let raw = part.slice(eq + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
    params[key] = raw;
  }
  return { type, params };
}

function collectLeaves(headers: Map<string, string>, body: string, leaves: MimeLeaf[]): void {
  const { type, params } = parseHeaderValueParams(headers.get('content-type'));

  if (type.startsWith('multipart/')) {
    const boundary = params['boundary'];
    if (!boundary) return;
    for (const rawPart of splitMultipart(body, boundary)) {
      const { headers: partHeaders, body: partBody } = splitHeadersAndBody(rawPart);
      collectLeaves(partHeaders, partBody, leaves);
    }
    return;
  }

  const transferEncoding = (headers.get('content-transfer-encoding') ?? '7bit').toLowerCase();
  const disposition = headers.get('content-disposition') ?? null;
  const dispositionParams = disposition ? parseHeaderValueParams(disposition).params : {};

  leaves.push({
    contentType: type || 'text/plain',
    params,
    disposition,
    filename: dispositionParams['filename'] ?? params['name'] ?? null,
    bytes: decodeTransferEncoding(body, transferEncoding)
  });
}

function buildFallbackLeaf(headers: Map<string, string>, body: string, rawBody: string): MimeLeaf {
  // Correos sin frontera MIME reconocible (sin Content-Type, o cuerpo sin
  // separador de encabezados): se trata todo el origen como una unica parte,
  // detectando HTML por su forma cuando no hay encabezado que lo declare.
  const declared = headers.get('content-type');
  const content = body.length > 0 ? body : rawBody;
  const type = declared
    ? parseHeaderValueParams(declared).type || 'text/plain'
    : /<[a-z][\s\S]*>/i.test(content)
      ? 'text/html'
      : 'text/plain';
  const transferEncoding = (headers.get('content-transfer-encoding') ?? '7bit').toLowerCase();
  return {
    contentType: type,
    params: declared ? parseHeaderValueParams(declared).params : {},
    disposition: null,
    filename: null,
    bytes: decodeTransferEncoding(content, transferEncoding)
  };
}

function isAttachmentLeaf(leaf: MimeLeaf): boolean {
  if (leaf.disposition?.toLowerCase().includes('attachment')) return true;
  return leaf.filename !== null && !leaf.contentType.startsWith('text/');
}

function splitMultipart(body: string, boundary: string): string[] {
  const delimiter = `--${boundary}`;
  const segments = body.split(delimiter);
  // El primer segmento es preambulo (se descarta) y el ultimo es el epilogo
  // que sigue al cierre "--boundary--" (tambien se descarta).
  return segments.slice(1, -1).map((segment) => segment.replace(/^\n/, '').replace(/\n$/, ''));
}

// --- Transfer-Encoding -------------------------------------------------------

function decodeTransferEncoding(text: string, encoding: string): Uint8Array {
  switch (encoding) {
    case 'base64':
      return new Uint8Array(Buffer.from(text.replace(/[\r\n\s]+/g, ''), 'base64'));
    case 'quoted-printable':
      return decodeQuotedPrintable(text);
    default:
      // 7bit/8bit/binary: cada caracter del origen ya representa un octeto de
      // la linea de transporte (los fixtures y el cliente IMAP entregan el
      // texto en esa correspondencia 1:1).
      return Uint8Array.from(Buffer.from(text, 'binary'));
  }
}

function decodeQuotedPrintable(text: string): Uint8Array {
  const withoutSoftBreaks = text.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < withoutSoftBreaks.length; i += 1) {
    const char = withoutSoftBreaks.charCodeAt(i);
    if (withoutSoftBreaks[i] === '=' && i + 2 < withoutSoftBreaks.length) {
      const hex = withoutSoftBreaks.slice(i + 1, i + 3);
      const code = Number.parseInt(hex, 16);
      if (!Number.isNaN(code)) {
        bytes.push(code);
        i += 2;
        continue;
      }
    }
    bytes.push(char & 0xff);
  }
  return Uint8Array.from(bytes);
}

// --- Juegos de caracteres ----------------------------------------------------

function decodeText(bytes: Uint8Array, declaredCharset: string | undefined): string {
  const declared = normalizeCharsetLabel(declaredCharset);
  const candidates = declared === 'utf-8' ? ['utf-8', 'windows-1252'] : [declared, 'utf-8', 'windows-1252'];

  for (const encoding of candidates) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      return repairMojibake(decoded);
    } catch {
      continue;
    }
  }
  // Ultimo recurso: nunca lanzar, aceptar caracteres de reemplazo antes que
  // interrumpir el procesamiento del lote (criterio 5, mismo espiritu).
  return repairMojibake(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
}

function normalizeCharsetLabel(label: string | undefined): string {
  const value = (label ?? '').trim().toLowerCase();
  return value === '' || value === 'us-ascii' || value === 'ascii' ? 'utf-8' : value;
}

// Patron clasico de UTF-8 decodificado como si fuera Latin-1/Windows-1252:
// el byte de cabecera de una secuencia multibyte UTF-8 (0xC2-0xC3 en espanol)
// cae en el rango Latin-1 "Ã"/"Â" y el byte de continuacion (0x80-0xBF) en el
// rango de simbolos Latin-1 superior. -¿ cubre ese segundo octeto.
const MOJIBAKE_PATTERN = /[ÃÂ][-¿]/;

function repairMojibake(text: string): string {
  // Cada caracter U+0000-U+00FF de la cadena corresponde 1:1 a un octeto
  // Latin-1, asi que reinterpretar esos mismos octetos como UTF-8 recupera
  // el texto original (p. ej. "MaÃ±ana" -> "Mañana") cuando es valido.
  if (!MOJIBAKE_PATTERN.test(text)) return text;
  try {
    const bytes = Uint8Array.from([...text].map((ch) => ch.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

function decodeEncodedWords(value: string): string {
  // RFC 2047: asuntos con caracteres no ASCII llegan como =?charset?B|Q?dato?=
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_match, charset: string, encoding: string, data: string) => {
    const bytes =
      encoding.toUpperCase() === 'B'
        ? Uint8Array.from(Buffer.from(data, 'base64'))
        : decodeQuotedPrintable(data.replace(/_/g, ' '));
    return decodeText(bytes, charset);
  });
}

// --- HTML a texto plano -------------------------------------------------------

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ntilde: 'Ñ'
};

function htmlToPlainText(html: string): string {
  const withoutScripts = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  const withLinksInlined = withoutScripts.replace(
    /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, label: string) => {
      const cleanLabel = label.replace(/<[^>]+>/g, '').trim();
      return cleanLabel && cleanLabel !== href ? `${cleanLabel} (${href})` : href;
    }
  );
  const withLineBreaks = withLinksInlined
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const withoutTags = withLineBreaks.replace(/<[^>]+>/g, '');
  return collapseWhitespace(decodeHtmlEntities(withoutTags));
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const isHex = entity[1] === 'x' || entity[1] === 'X';
      const codePoint = isHex ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

function collapseWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Firma, aviso legal y cadena de reenvio ----------------------------------

const TRAILING_BLOCK_MARKERS: readonly RegExp[] = [
  /^--\s*$/m,
  /^-{2,}\s*mensaje\s+original\s*-{2,}/im,
  /^-{2,}\s*original\s+message\s*-{2,}/im,
  /^de:\s*.+\nenviado:/im,
  /^from:\s*.+\nsent:/im,
  /^el\s+.{3,80}escribi[oó]:/im,
  /^(aviso legal|nota de confidencialidad)\b/im,
  /^este (correo|mensaje)( electr[oó]nico)?( y sus anexos)? (es|puede contener) (confidencial|informaci[oó]n confidencial)/im
];

function stripTrailingBlocks(text: string): string {
  let cutIndex = text.length;
  for (const marker of TRAILING_BLOCK_MARKERS) {
    const match = marker.exec(text);
    if (match && match.index < cutIndex) cutIndex = match.index;
  }
  return text.slice(0, cutIndex).trim();
}

// --- Destinatarios y fechas ---------------------------------------------------

function parseAddressList(headerValue: string | undefined): string[] {
  if (!headerValue) return [];
  return headerValue
    .split(',')
    .map((entry) => extractEmailAddress(entry))
    .filter((address): address is string => address !== null);
}

function extractEmailAddress(entry: string): string | null {
  const angleMatch = entry.match(/<([^>]+)>/);
  const candidate = (angleMatch?.[1] ?? entry).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate.toLowerCase() : null;
}

function deduplicate(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function resolveSentAt(dateHeader: string | undefined, fallback: Date): Date {
  if (!dateHeader) return fallback;
  const parsed = new Date(dateHeader);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
