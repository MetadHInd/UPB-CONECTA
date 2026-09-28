/**
 * HU-23 (RF-34): estado que el estudiante lleva de su postulacion a una
 * oferta de practica. Lo registra el propio estudiante: no es un dato de la
 * empresa ni de la Universidad.
 */
export enum PracticeApplicationStatus {
  INTERESTED = 'interesado',
  APPLIED = 'postulado',
  IN_PROCESS = 'en-proceso',
  CLOSED = 'cerrado'
}

/** Orden de la vista de seguimiento (criterio 5): el del avance de una postulacion. */
export const PRACTICE_APPLICATION_STATUSES: readonly PracticeApplicationStatus[] = Object.values(PracticeApplicationStatus);

/**
 * Criterio 3: solo una oferta marcada de interes o de postulacion recibe
 * recordatorio de cierre. En proceso ya no depende de la fecha de cierre, y
 * cerrado es el propio estudiante diciendo que ya no le interesa.
 */
export function wantsClosingReminder(status: PracticeApplicationStatus): boolean {
  return status === PracticeApplicationStatus.INTERESTED || status === PracticeApplicationStatus.APPLIED;
}

export interface PracticeApplicationStatusChange {
  readonly status: PracticeApplicationStatus;
  readonly at: Date;
}

/**
 * Seguimiento privado estudiante-oferta (RNF-20). Igual que el estado
 * personal de HU-16, es una entidad de relacion y no un campo de la oferta:
 * la oferta no sabe quien la sigue, y dos estudiantes nunca comparten fila.
 *
 * `offerTitle` y `company` son una copia tomada al marcar: si la oferta deja
 * de estar disponible, el estudiante sigue sabiendo cual era (criterio 6).
 */
export interface PracticeApplicationTracking {
  readonly studentId: string;
  /** `representativeMessageId` de la convocatoria, el mismo `offerId` del listado de HU-22. */
  readonly offerId: string;
  readonly offerTitle: string;
  readonly company: string | null;
  readonly status: PracticeApplicationStatus;
  /** Cada cambio con su marca de tiempo (criterio 2), del mas antiguo al mas reciente. */
  readonly history: readonly PracticeApplicationStatusChange[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
