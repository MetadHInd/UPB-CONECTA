/**
 * Normalizacion de texto contra el catalogo institucional: sin tildes, en
 * minusculas, sin puntuacion y con espacios colapsados. Es el criterio que
 * `ProgramTargetingResolver` (HU-07) ya usaba para reconocer programas en un
 * correo; se extrae aqui para que la traduccion del programa del directorio
 * (correccion del bug 3) use exactamente el mismo.
 */
export function normalizeCatalogText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
