/**
 * El dominio no consulta el reloj del sistema de forma directa, porque una
 * regla que depende de `new Date()` no es reproducible en prueba.
 */
export interface ClockPort {
  now(): Date;
}
