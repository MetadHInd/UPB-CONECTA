/**
 * Puntaje de confianza de una clasificacion (HU-10, RF-15, criterio 1).
 *
 * Convencion: numero real en el rango cerrado [0, 1], como una probabilidad —
 * 0 significa ninguna confianza, 1 significa certeza total. Se eligio [0, 1]
 * en vez de [0, 100] por ser la convencion mas comun al reportar la salida de
 * un clasificador (una probabilidad), y para poder comparar directamente
 * contra `ReviewThreshold` sin un factor de escala.
 */
export class ConfidenceScore {
  private constructor(readonly value: number) {}

  static of(value: number): ConfidenceScore {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new TypeError(`Puntaje de confianza invalido: ${String(value)}. Debe ser un numero finito en [0, 1].`);
    }
    return new ConfidenceScore(value);
  }

  /**
   * Confianza maxima. Se usa como valor por defecto cuando no hay un puntaje
   * real disponible (por ejemplo, codigo previo a HU-10 que construye un
   * `ClassificationResult` sin puntaje): asumir certeza total reproduce
   * exactamente el comportamiento anterior a esta historia, donde todo se
   * publicaba sin ninguna nocion de confianza.
   */
  static certain(): ConfidenceScore {
    return new ConfidenceScore(1);
  }

  equals(other: ConfidenceScore): boolean {
    return other instanceof ConfidenceScore && other.value === this.value;
  }
}
