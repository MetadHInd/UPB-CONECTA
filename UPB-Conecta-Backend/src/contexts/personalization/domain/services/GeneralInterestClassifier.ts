import type { DueDate } from '../../../ingestion/domain/value-objects/DueDate.js';

/**
 * HU-16, criterio 4 (PARCIAL): "un mensaje dirigido a toda la comunidad y
 * sin plazo se agrupa en la seccion de eventos de interes general" tiene dos
 * condiciones. Esta funcion solo evalua la mitad de fecha ("sin plazo"): la
 * mitad de destinatario ("dirigido a toda la comunidad") depende de la
 * asignacion de programas academicos (HU-07), que no existe todavia — sin
 * ella no hay forma de distinguir "sin programa asignado" (comunidad) de
 * "programa sin clasificar todavia" (pendiente). Un futuro feed debe
 * combinar este resultado con la señal de HU-07 antes de decidir la
 * seccion; usar solo esta funcion clasificaria erroneamente convocatorias
 * de un solo programa que simplemente no declaran fecha de cierre.
 *
 * Se importa `DueDate` de `ingestion` (tipo de dominio puro, sin infra) en
 * vez de duplicarlo: a diferencia de `ClockPort` (arbitrario, se duplica
 * por contexto), la interpretacion de "sin plazo" tiene que coincidir
 * exactamente con la que ya produce HU-08, o esta funcion se desincroniza
 * en silencio de lo que el resto del sistema entiende por "sin vencimiento".
 */
export function hasNoDeadline(dueDate: DueDate): boolean {
  return dueDate.kind === 'sin-vencimiento';
}
