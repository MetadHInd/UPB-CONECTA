import { describe, expect, it } from 'vitest';
import { ModerationThresholds, InvalidModerationThresholdsError } from '../../src/contexts/moderation/domain/value-objects/ModerationThresholds.js';
import {
  ModerationDecisionPolicy,
  ModerationReason,
  ModerationVerdict
} from '../../src/contexts/moderation/domain/services/ModerationDecisionPolicy.js';

const policy = new ModerationDecisionPolicy(ModerationThresholds.of(0.4, 0.8));
const decide = (score: number | null, dictionaryMatch = false) => policy.decide({ score, dictionaryMatch });

describe('HU-31 — política de decisión por umbral (dominio puro, fail-safe)', () => {
  it('criterio 3: por debajo del umbral inferior se publica', () => {
    expect(decide(0.39)).toMatchObject({ verdict: ModerationVerdict.PUBLISH, reason: ModerationReason.BELOW_LOWER_THRESHOLD });
    expect(decide(0)).toMatchObject({ verdict: ModerationVerdict.PUBLISH });
  });

  it('criterio 4: entre el umbral inferior y el superior se retiene, incluidos los límites', () => {
    expect(decide(0.4)).toMatchObject({ verdict: ModerationVerdict.RETAIN, reason: ModerationReason.BETWEEN_THRESHOLDS });
    expect(decide(0.6)).toMatchObject({ verdict: ModerationVerdict.RETAIN });
    expect(decide(0.8)).toMatchObject({ verdict: ModerationVerdict.RETAIN });
  });

  it('criterio 5: sobre el umbral superior se bloquea', () => {
    expect(decide(0.81)).toMatchObject({ verdict: ModerationVerdict.BLOCK, reason: ModerationReason.ABOVE_UPPER_THRESHOLD });
    expect(decide(1)).toMatchObject({ verdict: ModerationVerdict.BLOCK });
  });

  it('criterio 5: una coincidencia con el diccionario bloquea aunque el puntaje sea bajo o falte', () => {
    expect(decide(0.01, true)).toMatchObject({ verdict: ModerationVerdict.BLOCK, reason: ModerationReason.BANNED_TERM });
    expect(decide(null, true)).toMatchObject({ verdict: ModerationVerdict.BLOCK, reason: ModerationReason.BANNED_TERM });
  });

  it('criterio 6: sin puntaje (servicio caído) se retiene, nunca se publica', () => {
    expect(decide(null)).toEqual({ verdict: ModerationVerdict.RETAIN, reason: ModerationReason.SERVICE_UNAVAILABLE, score: null });
  });

  it.each([NaN, Infinity, -0.1, 1.2])('un puntaje inválido (%s) se retiene: ante la duda, retener', (score) => {
    expect(decide(score)).toMatchObject({ verdict: ModerationVerdict.RETAIN, reason: ModerationReason.INVALID_SCORE });
  });

  it('los umbrales deben cumplir 0 <= inferior < superior <= 1', () => {
    expect(() => ModerationThresholds.of(0.8, 0.4)).toThrow(InvalidModerationThresholdsError);
    expect(() => ModerationThresholds.of(0.5, 0.5)).toThrow(InvalidModerationThresholdsError);
    expect(() => ModerationThresholds.of(-0.1, 0.5)).toThrow(InvalidModerationThresholdsError);
    expect(() => ModerationThresholds.of(0.1, 1.5)).toThrow(InvalidModerationThresholdsError);
    expect(() => ModerationThresholds.of(NaN, 0.5)).toThrow(InvalidModerationThresholdsError);
  });
});
