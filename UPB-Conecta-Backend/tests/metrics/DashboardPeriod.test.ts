import { describe, expect, it } from 'vitest';
import { DashboardPeriod } from '../../src/contexts/metrics/domain/value-objects/DashboardPeriod.js';

describe('HU-51 — DashboardPeriod (criterio 5)', () => {
  it('construye un periodo valido cuando el inicio es anterior o igual al fin', () => {
    const period = DashboardPeriod.of(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-30T23:59:59Z'));

    expect(period.from).toEqual(new Date('2026-09-01T00:00:00Z'));
    expect(period.to).toEqual(new Date('2026-09-30T23:59:59Z'));
  });

  it('acepta un periodo de un solo instante (inicio igual al fin)', () => {
    const instant = new Date('2026-09-01T00:00:00Z');
    const period = DashboardPeriod.of(instant, instant);

    expect(period.includes(instant)).toBe(true);
  });

  it('rechaza un periodo con el fin antes del inicio', () => {
    expect(() => DashboardPeriod.of(new Date('2026-09-30T00:00:00Z'), new Date('2026-09-01T00:00:00Z'))).toThrow(TypeError);
  });

  it('rechaza fechas invalidas', () => {
    expect(() => DashboardPeriod.of(new Date('no-es-fecha'), new Date('2026-09-01T00:00:00Z'))).toThrow(TypeError);
    expect(() => DashboardPeriod.of(new Date('2026-09-01T00:00:00Z'), new Date('no-es-fecha'))).toThrow(TypeError);
  });

  it('includes es inclusivo en ambos extremos exactos', () => {
    const period = DashboardPeriod.of(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-30T00:00:00Z'));

    expect(period.includes(new Date('2026-09-01T00:00:00Z'))).toBe(true);
    expect(period.includes(new Date('2026-09-30T00:00:00Z'))).toBe(true);
    expect(period.includes(new Date('2026-08-31T23:59:59.999Z'))).toBe(false);
    expect(period.includes(new Date('2026-09-30T00:00:00.001Z'))).toBe(false);
  });
});
