/**
 * Umbral de revision configurable por un administrador (HU-10, RF-15,
 * criterio 4). Misma convencion que `ConfidenceScore`: numero real en [0, 1].
 *
 * El valor por defecto (0.6) es un punto de partida documentado, no una cifra
 * calibrada con datos reales — la nota metodologica de la historia es
 * explicita en que "la literatura no ofrece datos sobre clasificacion de
 * correo universitario por programa academico": el umbral correcto es un
 * aporte empirico que un administrador debe ajustar con la metrica real
 * (`ComputeClassificationPrecision`/`ComputeCoverageMetric`), no algo que
 * este repositorio pueda calibrar sin un piloto real.
 */
export class ReviewThreshold {
  private constructor(readonly value: number) {}

  static of(value: number): ReviewThreshold {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new TypeError(`Umbral de revision invalido: ${String(value)}. Debe ser un numero finito en [0, 1].`);
    }
    return new ReviewThreshold(value);
  }

  static default(): ReviewThreshold {
    return new ReviewThreshold(0.6);
  }

  equals(other: ReviewThreshold): boolean {
    return other instanceof ReviewThreshold && other.value === this.value;
  }
}
