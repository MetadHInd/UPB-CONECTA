import type { ModerationThresholds } from '../value-objects/ModerationThresholds.js';
import { ModerationDecisionPolicy, ModerationVerdict } from './ModerationDecisionPolicy.js';

/** Un texto etiquetado, ya evaluado por el modelo y el diccionario. */
export interface ScoredLabeledSample {
  readonly offensive: boolean;
  /** `null` si el modelo no entregó puntaje: la política lo retiene. */
  readonly score: number | null;
  readonly dictionaryMatch: boolean;
}

export interface ThresholdSimulationResult {
  readonly thresholds: { readonly lower: number; readonly upper: number };
  /** Decisiones sobre los ofensivos y los no ofensivos, por veredicto. */
  readonly offensive: VerdictCounts;
  readonly nonOffensive: VerdictCounts;
  /** Ofensivos que no se publican (retenidos o bloqueados) sobre el total de ofensivos; `null` sin ofensivos. */
  readonly coverage: number | null;
  /** No ofensivos que no se publican sobre el total de no ofensivos; `null` sin no ofensivos. */
  readonly falsePositiveRate: number | null;
}

export interface VerdictCounts {
  readonly publish: number;
  readonly retain: number;
  readonly block: number;
}

/**
 * HU-52 criterio 7: que pasaría con un conjunto etiquetado bajo unos umbrales.
 * Usa la misma `ModerationDecisionPolicy` que modera de verdad, así que la
 * simulación no puede discrepar de la decisión real.
 *
 * Cobertura y falsos positivos cuentan "no publicado" (retener o bloquear):
 * lo retenido no llega al foro sin una persona que lo apruebe. El detalle
 * por veredicto deja ver cuánto de eso es bloqueo directo.
 */
export function simulateThresholds(samples: readonly ScoredLabeledSample[], thresholds: ModerationThresholds): ThresholdSimulationResult {
  const policy = new ModerationDecisionPolicy(thresholds);
  const offensive = { publish: 0, retain: 0, block: 0 };
  const nonOffensive = { publish: 0, retain: 0, block: 0 };
  for (const sample of samples) {
    const { verdict } = policy.decide({ score: sample.score, dictionaryMatch: sample.dictionaryMatch });
    const counts = sample.offensive ? offensive : nonOffensive;
    counts[verdict === ModerationVerdict.PUBLISH ? 'publish' : verdict === ModerationVerdict.RETAIN ? 'retain' : 'block'] += 1;
  }
  return {
    thresholds: { lower: thresholds.lower, upper: thresholds.upper },
    offensive,
    nonOffensive,
    coverage: notPublishedRate(offensive),
    falsePositiveRate: notPublishedRate(nonOffensive)
  };
}

function notPublishedRate(counts: VerdictCounts): number | null {
  const total = counts.publish + counts.retain + counts.block;
  return total === 0 ? null : (counts.retain + counts.block) / total;
}
