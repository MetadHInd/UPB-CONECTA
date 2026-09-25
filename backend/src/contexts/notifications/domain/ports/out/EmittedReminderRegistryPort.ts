/**
 * HU-19: `EmitDueDateReminders` relee el estado vigente en cada ciclo (no
 * agenda timers por aviso individual — ver README, seccion HU-19), lo que
 * por si solo re-emitiria el mismo aviso en cada ciclo posterior al umbral.
 * Este puerto es el registro de idempotencia que evita eso: antes de
 * producir un `PendingNotification`, el caso de uso pregunta si ese aviso ya
 * se emitio.
 *
 * La clave incluye `dueAtEpochMs` (el cierre vigente en el momento del
 * calculo), no solo `(studentId, convocatoriaId, thresholdMinutes)` — a
 * proposito: es lo que resuelve el criterio 3 (recalculo al corregir la
 * fecha de cierre). Si el cierre cambia, la clave cambia, y el aviso para
 * ese umbral se trata como nunca emitido, sin necesitar ninguna logica de
 * invalidacion explicita.
 */
export interface EmittedReminderRegistryPort {
  wasEmitted(studentId: string, convocatoriaId: string, thresholdMinutes: number, dueAtEpochMs: number): Promise<boolean>;
  markEmitted(
    studentId: string,
    convocatoriaId: string,
    thresholdMinutes: number,
    dueAtEpochMs: number,
    at: Date
  ): Promise<void>;
}
