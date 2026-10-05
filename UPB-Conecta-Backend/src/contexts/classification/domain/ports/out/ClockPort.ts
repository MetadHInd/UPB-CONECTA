/**
 * Mismo contrato que el `ClockPort` de `ingestion`, `consent` y
 * `notifications`: cada contexto declara el suyo para no depender de otro.
 * Estructuralmente compatibles, asi que la ingesta puede compartir su reloj.
 */
export interface ClockPort {
  now(): Date;
}
