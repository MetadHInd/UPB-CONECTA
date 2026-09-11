/**
 * RF-01, criterio de aceptacion 2: la frecuencia es parametrizable sin
 * recompilar. La configuracion se lee del entorno en cada ciclo del
 * planificador, de modo que un cambio surte efecto sin redesplegar.
 */
export interface IngestionConfig {
  readonly intervalMs: number;
  readonly batchSize: number;
  /** HU-03, criterio 4: la ventana de deduplicacion cambia por entorno, sin redespliegue. */
  readonly deduplicationWindowMs: number;
}

export interface MailboxResilienceConfig {
  readonly retryMaxAttempts: number;
  readonly retryBaseMs: number;
  readonly retryMaxMs: number;
  readonly circuitFailureThreshold: number;
  readonly circuitCooldownMs: number;
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

// HU-03: ventana por defecto para agrupar reenvios institucionales (RF-05)
const DEFAULT_DEDUPLICATION_WINDOW_MS = 2_592_000_000; // 30 dias

// Parametros por defecto para la politica de reintento (HU-05)
const DEFAULT_MAILBOX_RETRY_MAX_ATTEMPTS = 3; // ademas del intento original
const DEFAULT_MAILBOX_RETRY_BASE_MS = 1_000; // 1s
const DEFAULT_MAILBOX_RETRY_MAX_MS = 30_000; // 30s
const MIN_MAILBOX_RETRY_BASE_MS = 0;
const MIN_MAILBOX_RETRY_MAX_MS = 1;
const MIN_MAILBOX_RETRY_ATTEMPTS = 0;

const DEFAULT_MAILBOX_CIRCUIT_FAILURE_THRESHOLD = 3; // fallos consecutivos para abrir el circuito
const DEFAULT_MAILBOX_CIRCUIT_COOLDOWN_MS = 60_000; // 60s
const MIN_MAILBOX_CIRCUIT_FAILURE_THRESHOLD = 1;
const MIN_MAILBOX_CIRCUIT_COOLDOWN_MS = 0;

export function readIngestionConfig(env: NodeJS.ProcessEnv = process.env): IngestionConfig {
  const intervalMs = parsePositiveInteger(env['INGESTION_INTERVAL_MS'], DEFAULT_INTERVAL_MS, 'INGESTION_INTERVAL_MS');
  const batchSize = parsePositiveInteger(env['INGESTION_BATCH_SIZE'], DEFAULT_BATCH_SIZE, 'INGESTION_BATCH_SIZE');
  const deduplicationWindowMs = parsePositiveInteger(
    env['DEDUPLICATION_WINDOW_MS'],
    DEFAULT_DEDUPLICATION_WINDOW_MS,
    'DEDUPLICATION_WINDOW_MS'
  );

  if (intervalMs < MIN_INTERVAL_MS) {
    throw new InvalidIngestionConfigError(
      `el intervalo ${intervalMs} ms es inferior al minimo permitido de ${MIN_INTERVAL_MS} ms`
    );
  }

  return { intervalMs, batchSize, deduplicationWindowMs };
}

export function readMailboxResilienceConfig(env: NodeJS.ProcessEnv = process.env): MailboxResilienceConfig {
  const retryMaxAttempts = parseNonNegativeInteger(env['MAILBOX_RETRY_MAX_ATTEMPTS'], DEFAULT_MAILBOX_RETRY_MAX_ATTEMPTS, 'MAILBOX_RETRY_MAX_ATTEMPTS');
  const retryBaseMs = parseNonNegativeInteger(env['MAILBOX_RETRY_BASE_MS'], DEFAULT_MAILBOX_RETRY_BASE_MS, 'MAILBOX_RETRY_BASE_MS');
  const retryMaxMs = parseNonNegativeInteger(env['MAILBOX_RETRY_MAX_MS'], DEFAULT_MAILBOX_RETRY_MAX_MS, 'MAILBOX_RETRY_MAX_MS');
  const circuitFailureThreshold = parsePositiveInteger(env['MAILBOX_CIRCUIT_BREAKER_FAILURE_THRESHOLD'], DEFAULT_MAILBOX_CIRCUIT_FAILURE_THRESHOLD, 'MAILBOX_CIRCUIT_BREAKER_FAILURE_THRESHOLD');
  const circuitCooldownMs = parseNonNegativeInteger(env['MAILBOX_CIRCUIT_BREAKER_COOLDOWN_MS'], DEFAULT_MAILBOX_CIRCUIT_COOLDOWN_MS, 'MAILBOX_CIRCUIT_BREAKER_COOLDOWN_MS');

  if (retryBaseMs < MIN_MAILBOX_RETRY_BASE_MS) {
    throw new InvalidIngestionConfigError(`MAILBOX_RETRY_BASE_MS debe ser >= ${MIN_MAILBOX_RETRY_BASE_MS}`);
  }
  if (retryMaxMs < MIN_MAILBOX_RETRY_MAX_MS) {
    throw new InvalidIngestionConfigError(`MAILBOX_RETRY_MAX_MS debe ser >= ${MIN_MAILBOX_RETRY_MAX_MS}`);
  }
  if (retryMaxMs < retryBaseMs) {
    throw new InvalidIngestionConfigError(`MAILBOX_RETRY_MAX_MS (${retryMaxMs}) no puede ser inferior a MAILBOX_RETRY_BASE_MS (${retryBaseMs})`);
  }
  if (circuitFailureThreshold < MIN_MAILBOX_CIRCUIT_FAILURE_THRESHOLD) {
    throw new InvalidIngestionConfigError(`MAILBOX_CIRCUIT_BREAKER_FAILURE_THRESHOLD debe ser >= ${MIN_MAILBOX_CIRCUIT_FAILURE_THRESHOLD}`);
  }
  if (circuitCooldownMs < MIN_MAILBOX_CIRCUIT_COOLDOWN_MS) {
    throw new InvalidIngestionConfigError(`MAILBOX_CIRCUIT_BREAKER_COOLDOWN_MS debe ser >= ${MIN_MAILBOX_CIRCUIT_COOLDOWN_MS}`);
  }

  return { retryMaxAttempts, retryBaseMs, retryMaxMs, circuitFailureThreshold, circuitCooldownMs };
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidIngestionConfigError(`${name} debe ser un entero positivo, se recibio "${raw}"`);
  }
  return parsed;
}

function parseNonNegativeInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidIngestionConfigError(`${name} debe ser un entero no negativo, se recibio "${raw}"`);
  }
  return parsed;
}
