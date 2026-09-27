export class InvalidModerationThresholdsError extends Error {
  constructor(motivo: string) {
    super(`Umbrales de moderación inválidos: ${motivo}`);
    this.name = 'InvalidModerationThresholdsError';
  }
}

/**
 * Umbrales de severidad de la moderación automática (HU-31 criterios 3 a 5).
 * El puntaje del modelo va de 0 (limpio) a 1 (ofensivo). Por debajo de
 * `lower` se publica; de `lower` a `upper` (ambos incluidos) se retiene para
 * revisión humana; por encima de `upper` se bloquea. Son dato de
 * configuración (`config/moderation-policy.json`), no constantes del código.
 */
export class ModerationThresholds {
  private constructor(
    readonly lower: number,
    readonly upper: number
  ) {}

  static of(lower: number, upper: number): ModerationThresholds {
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) throw new InvalidModerationThresholdsError('los umbrales deben ser números.');
    if (lower < 0 || upper > 1) throw new InvalidModerationThresholdsError('los umbrales deben estar entre 0 y 1.');
    if (lower >= upper) throw new InvalidModerationThresholdsError('el umbral inferior debe ser menor que el superior.');
    return new ModerationThresholds(lower, upper);
  }
}
