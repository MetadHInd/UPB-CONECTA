/**
 * HU-51, criterio 5: "dado un periodo seleccionable, cuando el administrador
 * lo cambia, entonces las metricas se recalculan sobre ese rango". El rango
 * es un value object, no un par de `Date` sueltos, por la misma razon que
 * `ReviewThreshold`/`ConfidenceScore` (HU-10) son clases y no numeros sueltos:
 * un `{from, to}` invalido (fin antes que inicio, fechas invalidas) es un
 * error de quien arma el tablero, y falla aqui, en la frontera del dominio,
 * en vez de producir un rango silenciosamente vacio o invertido mas adelante.
 *
 * Los limites son inclusivos en ambos extremos: un mensaje persistido
 * exactamente en `from` o exactamente en `to` cuenta como parte del periodo.
 */
export class DashboardPeriod {
  private constructor(
    readonly from: Date,
    readonly to: Date
  ) {}

  static of(from: Date, to: Date): DashboardPeriod {
    if (!(from instanceof Date) || Number.isNaN(from.getTime())) {
      throw new TypeError(`Fecha de inicio de periodo invalida: ${String(from)}.`);
    }
    if (!(to instanceof Date) || Number.isNaN(to.getTime())) {
      throw new TypeError(`Fecha de fin de periodo invalida: ${String(to)}.`);
    }
    if (from.getTime() > to.getTime()) {
      throw new TypeError(
        `El inicio del periodo (${from.toISOString()}) no puede ser posterior al fin (${to.toISOString()}).`
      );
    }
    return new DashboardPeriod(from, to);
  }

  /** Inclusivo en ambos extremos. */
  includes(date: Date): boolean {
    const time = date.getTime();
    return time >= this.from.getTime() && time <= this.to.getTime();
  }
}
