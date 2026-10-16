/**
 * Mismo contrato que el `ClockPort` de los demas contextos: cada contexto
 * declara el suyo para no depender de otro.
 */
export interface ClockPort {
  now(): Date;
}
