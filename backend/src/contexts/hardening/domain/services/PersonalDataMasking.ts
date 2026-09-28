/** Quién escribe el texto: se usa solo para reconocer sus datos dentro de él, nunca viaja. */
export interface MaskedPersonIdentity {
  readonly name: string;
  readonly email: string;
  readonly studentId?: string | null;
}

/** La coma y el punto y coma no forman parte de un correo: "a@b.co, ..." conserva la coma. */
const EMAIL = /[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+/g;
/** Seis o más dígitos con separadores sueltos: teléfonos, cédulas, códigos estudiantiles. */
const LONG_NUMBER = /\d(?:[ .-]?\d){5,}/g;
const WORD = /[\p{L}\p{N}]+/gu;
/** Partículas que no identifican a nadie y aparecen en cualquier texto. */
const NAME_PARTICLES = new Set(['del', 'las', 'los', 'van', 'von', 'der', 'den']);

/**
 * Enmascara los datos identificatorios que un estudiante escribe en un texto
 * libre antes de enviarlo a un proveedor externo (RNF-19): correos, números
 * largos, su identificador estudiantil y las palabras de su nombre y de su
 * usuario, porque los estudiantes a veces se firman en el texto. Sin
 * `person`, solo correos y números largos. Lo usan la moderación (HU-31
 * criterio 7) y el chatbot (HU-40 criterio 4).
 */
export function maskPersonalData(text: string, person: MaskedPersonIdentity | null = null): string {
  let masked = text;
  const studentId = person?.studentId?.trim();
  if (studentId) masked = masked.split(studentId).join('[dato]');
  masked = masked.replace(EMAIL, '[correo]').replace(LONG_NUMBER, '[número]');
  if (person === null) return masked;

  const identifying = identifyingWords(person);
  return masked.replace(WORD, (word) => (identifying.has(fold(word)) ? '[nombre]' : word));
}

function identifyingWords(person: MaskedPersonIdentity): Set<string> {
  const localPart = person.email.split('@')[0] ?? '';
  const words = `${person.name} ${localPart.replace(/[._+-]/g, ' ')}`
    .split(/\s+/)
    .map(fold)
    .filter((word) => word.length >= 3 && !NAME_PARTICLES.has(word));
  return new Set(words);
}

/** Minúsculas y sin tildes: "Gómez" y "gomez" son la misma palabra. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
