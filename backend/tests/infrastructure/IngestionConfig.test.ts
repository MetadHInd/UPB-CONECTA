import { describe, it, expect } from 'vitest';
import { readIngestionConfig, InvalidIngestionConfigError } from '../../src/contexts/ingestion/infrastructure/config/IngestionConfig.js';

describe('readIngestionConfig, criterio de aceptacion 2', () => {
  it('usa valores por defecto cuando el entorno no declara nada', () => {
    const config = readIngestionConfig({});
    expect(config.intervalMs).toBe(300_000);
    expect(config.batchSize).toBe(200);
    expect(config.deduplicationWindowMs).toBe(2_592_000_000);
    expect(config.quarantineIncidentThresholdRatio).toBe(0.2);
  });

  it('toma el intervalo del entorno sin recompilar', () => {
    const config = readIngestionConfig({ INGESTION_INTERVAL_MS: '60000', INGESTION_BATCH_SIZE: '50' });
    expect(config.intervalMs).toBe(60_000);
    expect(config.batchSize).toBe(50);
  });

  it('HU-03 criterio 4: toma la ventana de deduplicacion del entorno sin redespliegue', () => {
    const config = readIngestionConfig({ DEDUPLICATION_WINDOW_MS: '86400000' });
    expect(config.deduplicationWindowMs).toBe(86_400_000);
  });

  it('rechaza una ventana de deduplicacion no numerica', () => {
    expect(() => readIngestionConfig({ DEDUPLICATION_WINDOW_MS: 'siempre' })).toThrow(InvalidIngestionConfigError);
  });

  it('HU-04 criterio 4: toma el umbral de incidente de cuarentena del entorno sin redespliegue', () => {
    const config = readIngestionConfig({ QUARANTINE_INCIDENT_THRESHOLD_RATIO: '0.5' });
    expect(config.quarantineIncidentThresholdRatio).toBe(0.5);
  });

  it('rechaza un umbral de cuarentena fuera del rango 0-1', () => {
    expect(() => readIngestionConfig({ QUARANTINE_INCIDENT_THRESHOLD_RATIO: '1.5' })).toThrow(InvalidIngestionConfigError);
    expect(() => readIngestionConfig({ QUARANTINE_INCIDENT_THRESHOLD_RATIO: '-0.1' })).toThrow(InvalidIngestionConfigError);
    expect(() => readIngestionConfig({ QUARANTINE_INCIDENT_THRESHOLD_RATIO: 'alto' })).toThrow(InvalidIngestionConfigError);
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
