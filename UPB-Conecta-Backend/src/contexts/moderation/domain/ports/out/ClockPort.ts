/** Mismo contrato que el resto de contextos: cada uno declara el suyo, estructuralmente compatibles. */
export interface ClockPort {
  now(): Date;
}
