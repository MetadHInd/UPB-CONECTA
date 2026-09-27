/**
 * HU-48: invalida las sesiones activas del titular al suprimir sus datos. Idempotente:
 * sin sesiones vivas devuelve 0. `subject` = correo institucional normalizado.
 */
export interface SessionRevocationPort {
  revokeAll(subject: string): Promise<number>;
}
