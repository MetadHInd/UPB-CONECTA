/**
 * RF-01, criterio de aceptacion 2: la frecuencia es parametrizable sin
 * recompilar. La configuracion se lee del entorno en cada ciclo del
 * planificador, de modo que un cambio surte efecto sin redesplegar.
 */
export interface IngestionConfig {
  readonly intervalMs: number;
  readonly batchSize: number;
}

export class InvalidIngestionConfigError extends Error {
  constructor(motivo: string) {
    super(`Configuracion de ingesta invalida: ${motivo}`);
    this.name = 'InvalidIngestionConfigError';
  }
}

const DEFAULT_INTERVAL_MS = 300_000; // cinco minutos
const DEFAULT_BATCH_SIZE = 200;      // RNF-02 dimensiona el lote en 200 mensajes
const MIN_INTERVAL_MS = 10_000;      // evita saturar el buzon institucional

export function readIngestionConfig(env: NodeJS.ProcessEnv = process.env): IngestionConfig {
  const intervalMs = parsePositiveInteger(env['INGESTION_INTERVAL_MS'], DEFAULT_INTERVAL_MS, 'INGESTION_INTERVAL_MS');
  const batchSize = parsePositiveInteger(env['INGESTION_BATCH_SIZE'], DEFAULT_BATCH_SIZE, 'INGESTION_BATCH_SIZE');

  if (intervalMs < MIN_INTERVAL_MS) {
    throw new InvalidIngestionConfigError(
      `el intervalo ${intervalMs} ms es inferior al minimo permitido de ${MIN_INTERVAL_MS} ms`
    );
  }
  return { intervalMs, batchSize };
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidIngestionConfigError(`${name} debe ser un entero positivo, se recibio "${raw}"`);
  }
  return parsed;
}
