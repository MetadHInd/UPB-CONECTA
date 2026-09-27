import type { ModerationThresholds } from '../value-objects/ModerationThresholds.js';

/**
 * Decisión de la moderación automática sobre un texto (HU-31). Tipo estable
 * de dominio: lo consumen el foro (publicar, retener, bloquear) y, más
 * adelante, los reportes de la comunidad (HU-34).
 */
export enum ModerationVerdict {
  PUBLISH = 'publish',
  RETAIN = 'retain',
  BLOCK = 'block'
}

export enum ModerationReason {
  BELOW_LOWER_THRESHOLD = 'below-lower-threshold',
  BETWEEN_THRESHOLDS = 'between-thresholds',
  ABOVE_UPPER_THRESHOLD = 'above-upper-threshold',
  BANNED_TERM = 'banned-term',
  /** El servicio falló, no respondió a tiempo o respondió algo ilegible. */
  SERVICE_UNAVAILABLE = 'service-unavailable',
  /** El servicio respondió, pero con un puntaje fuera de [0, 1]. */
  INVALID_SCORE = 'invalid-score'
}

export interface ModerationDecision {
  readonly verdict: ModerationVerdict;
  readonly reason: ModerationReason;
  /** `null` cuando no hubo puntaje utilizable. */
  readonly score: number | null;
}

export interface ModerationDecisionInput {
  /** Puntaje del modelo, o `null` si el servicio no entregó ninguno. */
  readonly score: number | null;
  readonly dictionaryMatch: boolean;
}

/**
 * Política pura y fail-safe: la única salida que publica es un puntaje válido
 * por debajo del umbral inferior y sin coincidencia con el diccionario. Todo
 * lo demás que no sea un bloqueo claro se retiene (criterio 6: en ningún caso
 * se publica sin haber sido analizado).
 */
export class ModerationDecisionPolicy {
  constructor(private readonly thresholds: ModerationThresholds) {}

  decide(input: ModerationDecisionInput): ModerationDecision {
    const { score, dictionaryMatch } = input;
    if (dictionaryMatch) return { verdict: ModerationVerdict.BLOCK, reason: ModerationReason.BANNED_TERM, score };
    if (score === null) return { verdict: ModerationVerdict.RETAIN, reason: ModerationReason.SERVICE_UNAVAILABLE, score: null };
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      return { verdict: ModerationVerdict.RETAIN, reason: ModerationReason.INVALID_SCORE, score: null };
    }
    if (score > this.thresholds.upper) return { verdict: ModerationVerdict.BLOCK, reason: ModerationReason.ABOVE_UPPER_THRESHOLD, score };
    if (score >= this.thresholds.lower) return { verdict: ModerationVerdict.RETAIN, reason: ModerationReason.BETWEEN_THRESHOLDS, score };
    return { verdict: ModerationVerdict.PUBLISH, reason: ModerationReason.BELOW_LOWER_THRESHOLD, score };
  }
}
