import type { DueDate } from '../value-objects/DueDate.js';

/**
 * HU-15, criterio 4: el estado de vencimiento se indica de forma inequivoca.
 * Cubre los cuatro estados posibles de `DueDate` explicitamente — una
 * convocatoria con fecha ambigua no es "vigente" ni "sin vencimiento": es un
 * cuarto estado propio, para no ocultarle al estudiante que la fecha no se
 * pudo interpretar con certeza.
 */
export type ConvocatoriaStatus = 'vigente' | 'vencida' | 'sin-vencimiento' | 'fecha-ambigua';

export function evaluateConvocatoriaStatus(dueDate: DueDate, now: Date): ConvocatoriaStatus {
  switch (dueDate.kind) {
    case 'sin-vencimiento':
      return 'sin-vencimiento';
    case 'ambigua':
      return 'fecha-ambigua';
    case 'con-fecha':
      return dueDate.date.getTime() < now.getTime() ? 'vencida' : 'vigente';
  }
}
