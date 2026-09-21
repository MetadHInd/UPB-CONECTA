import { describe, expect, it } from 'vitest';
import { ConfidenceScore } from '../../src/contexts/classification/domain/value-objects/ConfidenceScore.js';
import { ReviewThreshold } from '../../src/contexts/classification/domain/value-objects/ReviewThreshold.js';
import { decidePublicationStatus } from '../../src/contexts/classification/domain/services/PublicationDecisionPolicy.js';

describe('HU-10 — ConfidenceScore y ReviewThreshold (value objects)', () => {
  it.each([0, 0.5, 1])('ConfidenceScore acepta %s dentro de [0, 1]', (value) => {
    expect(ConfidenceScore.of(value).value).toBe(value);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY])('ConfidenceScore rechaza %s', (value) => {
    expect(() => ConfidenceScore.of(value)).toThrow(TypeError);
  });

  it('ConfidenceScore.certain() es 1 y equals compara por valor', () => {
    expect(ConfidenceScore.certain().value).toBe(1);
    expect(ConfidenceScore.of(0.7).equals(ConfidenceScore.of(0.7))).toBe(true);
    expect(ConfidenceScore.of(0.7).equals(ConfidenceScore.of(0.71))).toBe(false);
  });

  it.each([0, 0.6, 1])('ReviewThreshold acepta %s dentro de [0, 1]', (value) => {
    expect(ReviewThreshold.of(value).value).toBe(value);
  });

  it.each([-1, 2, Number.NaN])('ReviewThreshold rechaza %s', (value) => {
    expect(() => ReviewThreshold.of(value)).toThrow(TypeError);
  });

  it('ReviewThreshold.default() es 0.6 y equals compara por valor', () => {
    expect(ReviewThreshold.default().value).toBe(0.6);
    expect(ReviewThreshold.of(0.6).equals(ReviewThreshold.default())).toBe(true);
    expect(ReviewThreshold.of(0.5).equals(ReviewThreshold.default())).toBe(false);
  });
});

describe('HU-10 — PublicationDecisionPolicy (politica de dominio pura)', () => {
  const threshold = ReviewThreshold.of(0.6);

  it('criterio 2: un puntaje por debajo del umbral queda en revision pendiente', () => {
    expect(decidePublicationStatus(ConfidenceScore.of(0.59), threshold)).toBe('pending-review');
  });

  it('criterio 3: un puntaje sobre el umbral se publica', () => {
    expect(decidePublicationStatus(ConfidenceScore.of(0.61), threshold)).toBe('published');
  });

  it('limite exacto: un puntaje igual al umbral se publica', () => {
    expect(decidePublicationStatus(ConfidenceScore.of(0.6), threshold)).toBe('published');
  });
});
