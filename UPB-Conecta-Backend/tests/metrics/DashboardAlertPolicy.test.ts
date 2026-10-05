import { describe, expect, it } from 'vitest';
import { evaluateMetricAlert } from '../../src/contexts/metrics/domain/services/DashboardAlertPolicy.js';

describe('HU-51 — DashboardAlertPolicy (criterio 6)', () => {
  describe('direccion "no-debe-superar" (techo: cuarentena, correccion manual)', () => {
    it('sin datos, no hay alerta (tercer estado explicito)', () => {
      const result = evaluateMetricAlert('m', null, 0.2, 'no-debe-superar');

      expect(result.status).toBe('sin-datos');
    });

    it('exactamente en el umbral no es alerta (limite exacto cumple el objetivo)', () => {
      const result = evaluateMetricAlert('m', 0.2, 0.2, 'no-debe-superar');

      expect(result.status).toBe('normal');
    });

    it('por debajo del umbral no es alerta', () => {
      const result = evaluateMetricAlert('m', 0.1, 0.2, 'no-debe-superar');

      expect(result.status).toBe('normal');
    });

    it('estrictamente por encima del umbral es alerta', () => {
      const result = evaluateMetricAlert('m', 0.2001, 0.2, 'no-debe-superar');

      expect(result.status).toBe('alerta');
    });
  });

  describe('direccion "no-debe-caer-bajo" (piso: precision, cobertura)', () => {
    it('sin datos, no hay alerta', () => {
      const result = evaluateMetricAlert('m', null, 0.8, 'no-debe-caer-bajo');

      expect(result.status).toBe('sin-datos');
    });

    it('exactamente en el umbral no es alerta', () => {
      const result = evaluateMetricAlert('m', 0.8, 0.8, 'no-debe-caer-bajo');

      expect(result.status).toBe('normal');
    });

    it('por encima del umbral no es alerta', () => {
      const result = evaluateMetricAlert('m', 0.9, 0.8, 'no-debe-caer-bajo');

      expect(result.status).toBe('normal');
    });

    it('estrictamente por debajo del umbral es alerta', () => {
      const result = evaluateMetricAlert('m', 0.7999, 0.8, 'no-debe-caer-bajo');

      expect(result.status).toBe('alerta');
    });
  });

  it('conserva el valor, el umbral y la direccion recibidos en el resultado', () => {
    const result = evaluateMetricAlert('tasaCorreccionManual', 0.5, 0.3, 'no-debe-superar');

    expect(result).toEqual({
      metric: 'tasaCorreccionManual',
      value: 0.5,
      threshold: 0.3,
      direction: 'no-debe-superar',
      status: 'alerta'
    });
  });
});
