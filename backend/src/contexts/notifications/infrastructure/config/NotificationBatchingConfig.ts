/**
 * HU-21, criterio 3: el limite diario de avisos por estudiante y el tamaño
 * de la ventana de agrupacion cambian por variable de entorno, sin
 * redespliegue — mismo patron que `IngestionConfig` (HU-01) y
 * `QUARANTINE_INCIDENT_THRESHOLD_RATIO` (HU-04).
 */
export interface NotificationBatchingConfig {
  readonly windowMs: number;
  readonly dailyLimit: number;
}

export class InvalidNotificationBatchingConfigError extends Error {
  constructor(motivo: string) {
    super(`Configuracion de agrupacion de avisos invalida: ${motivo}`);
    this.name = 'InvalidNotificationBatchingConfigError';
  }
}

const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const DEFAULT_DAILY_LIMIT = 5;

export function readNotificationBatchingConfig(env: NodeJS.ProcessEnv = process.env): NotificationBatchingConfig {
  const windowMs = parsePositiveInteger(env['NOTIFICATION_BATCH_WINDOW_MS'], DEFAULT_WINDOW_MS, 'NOTIFICATION_BATCH_WINDOW_MS');
  const dailyLimit = parsePositiveInteger(env['NOTIFICATION_DAILY_LIMIT'], DEFAULT_DAILY_LIMIT, 'NOTIFICATION_DAILY_LIMIT');
  return { windowMs, dailyLimit };
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidNotificationBatchingConfigError(`${name} debe ser un entero positivo, se recibio "${raw}"`);
  }
  return parsed;
}
