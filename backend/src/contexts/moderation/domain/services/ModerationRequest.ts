import type { ModerationRequest } from '../ports/out/ModerationPort.js';
import { normalizeForMatching } from './TextNormalization.js';

export interface ModerationAuthorIdentity {
  readonly name: string;
  readonly email: string;
  readonly studentId?: string | null;
}

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/g;
/** Seis o más dígitos con separadores sueltos: teléfonos, cédulas, códigos estudiantiles. */
const LONG_NUMBER = /\d(?:[ .-]?\d){5,}/g;
const WORD = /[\p{L}\p{N}]+/gu;
/** Partículas que no identifican a nadie y aparecen en cualquier texto. */
const NAME_PARTICLES = new Set(['del', 'las', 'los', 'van', 'von', 'der', 'den']);

/**
 * Arma lo que se envía al servicio externo (HU-31 criterio 7): título y
 * cuerpo, sin datos identificatorios. El autor nunca viaja como campo; además
 * se enmascaran, dentro del propio texto, correos, números largos, el
 * identificador estudiantil y las palabras del nombre y del usuario del
 * autor, porque los estudiantes a veces se firman en el texto.
 */
export function buildModerationRequest(input: {
  readonly title: string;
  readonly text: string;
  readonly author: ModerationAuthorIdentity;
}): ModerationRequest {
  const { author } = input;
  let text = `${input.title}\n${input.text}`;

  const studentId = author.studentId?.trim();
  if (studentId) text = text.split(studentId).join('[dato]');
  text = text.replace(EMAIL, '[correo]').replace(LONG_NUMBER, '[número]');

  const identifying = identifyingWords(author);
  text = text.replace(WORD, (word) => (identifying.has(normalizeForMatching(word)) ? '[nombre]' : word));
  return { text };
}

function identifyingWords(author: ModerationAuthorIdentity): Set<string> {
  const localPart = author.email.split('@')[0] ?? '';
  const words = `${author.name} ${localPart.replace(/[._+-]/g, ' ')}`
    .split(/\s+/)
    .map(normalizeForMatching)
    .filter((word) => word.length >= 3 && !NAME_PARTICLES.has(word));
  return new Set(words);
}
