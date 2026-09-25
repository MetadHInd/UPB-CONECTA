/**
 * HU-19 (RF-27): "los umbrales son value objects" (diseno de la historia en
 * Jira) — un umbral de anticipacion es una cantidad de minutos antes del
 * cierre en la que corresponde avisar. Se modela como value object (en vez
 * de pasar `number` suelto) para que la validacion (positivo, finito) viva
 * en un unico lugar y no pueda construirse un umbral invalido en ningun
 * punto del dominio.
 */
export class AnticipationThreshold {
  private constructor(readonly minutes: number) {}

  static ofMinutes(minutes: number): AnticipationThreshold {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new RangeError(`La anticipacion debe ser un numero positivo de minutos, se recibio ${minutes}`);
    }
    return new AnticipationThreshold(minutes);
  }

  /** El instante en que deberia dispararse un aviso con esta anticipacion, dado el cierre `dueAt`. */
  instantFor(dueAt: Date): Date {
    return new Date(dueAt.getTime() - this.minutes * 60_000);
  }
}
