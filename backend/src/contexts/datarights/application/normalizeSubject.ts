/** El sujeto es el correo institucional de la sesion (HU-45); todos los contextos lo normalizan igual. */
export function normalizeSubject(subject: string): string {
  return subject.trim().toLowerCase();
}
