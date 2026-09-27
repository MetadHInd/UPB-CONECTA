/** Mismo contrato que el `ClockPort` de los demas contextos: cada contexto declara el suyo. */
export interface ClockPort {
  now(): Date;
}
