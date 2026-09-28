import type { ModerationLabeledSampleRepositoryPort } from '../domain/ports/out/ModerationLabeledSampleRepositoryPort.js';
import type { ModerationPort } from '../domain/ports/out/ModerationPort.js';
import type { ModerationRulesRepositoryPort } from '../domain/ports/out/ModerationRulesRepositoryPort.js';
import { BannedTermsDictionary } from '../domain/services/BannedTermsDictionary.js';
import { simulateThresholds, type ScoredLabeledSample, type ThresholdSimulationResult } from '../domain/services/ThresholdSimulation.js';
import { InvalidModerationThresholdsError, ModerationThresholds } from '../domain/value-objects/ModerationThresholds.js';
import { scoreWithin } from './ModerationScoring.js';

export type SimulateModerationThresholdsResult =
  | {
      readonly ok: true;
      readonly sampleSize: number;
      /** Textos que el modelo no puntuó: la política los retiene, igual que en producción. */
      readonly unscored: number;
      readonly current: ThresholdSimulationResult;
      readonly proposed: ThresholdSimulationResult;
      /** Proposed menos current; `null` si alguno de los dos no se puede calcular. */
      readonly delta: { readonly coverage: number | null; readonly falsePositiveRate: number | null };
    }
  | { readonly ok: false; readonly error: 'invalid-thresholds' | 'no-labeled-samples'; readonly message: string };

/**
 * HU-52 (RF-78), criterio 7: antes de aplicar un umbral, el administrador ve
 * su efecto sobre la cobertura de contenido ofensivo y los falsos positivos
 * del conjunto etiquetado, comparado con los umbrales vigentes. No cambia
 * ninguna regla ni registra decisiones.
 *
 * Cada texto se puntúa una sola vez con el mismo modelo y plazo que la
 * moderación real, y se evalúa contra el diccionario vigente; los dos juegos
 * de umbrales se aplican a esos mismos puntajes. El conjunto etiquetado lo
 * construye HU-57: sin él no hay nada que simular y se dice así.
 */
export class SimulateModerationThresholds {
  constructor(
    private readonly dependencies: {
      readonly moderation: ModerationPort;
      readonly rules: ModerationRulesRepositoryPort;
      readonly samples: ModerationLabeledSampleRepositoryPort;
      readonly timeoutMs: number;
    }
  ) {}

  async execute(input: { readonly lower: number; readonly upper: number }): Promise<SimulateModerationThresholdsResult> {
    let proposed: ModerationThresholds;
    try {
      proposed = ModerationThresholds.of(input.lower, input.upper);
    } catch (error) {
      if (error instanceof InvalidModerationThresholdsError) return { ok: false, error: 'invalid-thresholds', message: error.message };
      throw error;
    }

    const { moderation, rules, samples, timeoutMs } = this.dependencies;
    const labeled = await samples.findAll();
    if (labeled.length === 0) {
      return { ok: false, error: 'no-labeled-samples', message: 'No hay un conjunto de prueba etiquetado sobre el cual simular.' };
    }

    const current = (await rules.get()).rules;
    const dictionary = new BannedTermsDictionary(current.bannedTerms);
    const scored: ScoredLabeledSample[] = [];
    for (const sample of labeled) {
      scored.push({
        offensive: sample.offensive,
        score: await scoreWithin(moderation, { text: sample.text }, timeoutMs),
        dictionaryMatch: dictionary.matches(sample.text)
      });
    }

    const currentResult = simulateThresholds(scored, current.thresholds);
    const proposedResult = simulateThresholds(scored, proposed);
    return {
      ok: true,
      sampleSize: scored.length,
      unscored: scored.filter((sample) => sample.score === null).length,
      current: currentResult,
      proposed: proposedResult,
      delta: {
        coverage: difference(proposedResult.coverage, currentResult.coverage),
        falsePositiveRate: difference(proposedResult.falsePositiveRate, currentResult.falsePositiveRate)
      }
    };
  }
}

function difference(proposed: number | null, current: number | null): number | null {
  return proposed === null || current === null ? null : proposed - current;
}
