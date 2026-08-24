import { describe, it, expect } from 'vitest';
import { readIngestionConfig, InvalidIngestionConfigError } from '../../src/contexts/ingestion/infrastructure/config/IngestionConfig.js';

describe('readIngestionConfig, criterio de aceptacion 2', () => {
  it('usa valores por defecto cuando el entorno no declara nada', () => {
    const config = readIngestionConfig({});
    expect(config.intervalMs).toBe(300_000);
    expect(config.batchSize).toBe(200);
  });

  it('toma el intervalo del entorno sin recompilar', () => {
    const config = readIngestionConfig({ INGESTION_INTERVAL_MS: '60000', INGESTION_BATCH_SIZE: '50' });
    expect(config.intervalMs).toBe(60_000);
    expect(config.batchSize).toBe(50);
  });

  it('rechaza un intervalo por debajo del minimo que protege al buzon', () => {
    expect(() => readIngestionConfig({ INGESTION_INTERVAL_MS: '500' })).toThrow(InvalidIngestionConfigError);
  });

  it('rechaza valores no numericos o no enteros', () => {
    expect(() => readIngestionConfig({ INGESTION_INTERVAL_MS: 'rapido' })).toThrow(InvalidIngestionConfigError);
    expect(() => readIngestionConfig({ INGESTION_BATCH_SIZE: '-5' })).toThrow(InvalidIngestionConfigError);
    expect(() => readIngestionConfig({ INGESTION_BATCH_SIZE: '2.5' })).toThrow(InvalidIngestionConfigError);
  });
});
