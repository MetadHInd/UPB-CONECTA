import { AnticipationThreshold } from '../../domain/value-objects/AnticipationThreshold.js';

/**
 * HU-19: intervalo del planificador (criterio 2: emitir dentro de los 60
 * segundos siguientes al instante previsto) y los umbrales de anticipacion
 * que fija el sistema (criterio 1, junto a los que elige cada estudiante en
 * sus preferencias) — configurables por variable de entorno, sin
 * redespliegue, mismo patron que `NotificationBatchingConfig` (HU-21) e
 * `IngestionConfig` (HU-01).
 */
export interface DueDateReminderConfig {
  readonly pollIntervalMs: number;
  readonly systemThresholds: readonly AnticipationThreshold[];
}

export class InvalidDueDateReminderConfigError extends Error {
  constructor(motivo: string) {
    super(`Configuracion del planificador de avisos de vencimiento invalida: ${motivo}`);
    this.name = 'InvalidDueDateReminderConfigError';
  }
}

/**
 * Un dia antes del cierre: mismo valor por defecto que
 * `DEFAULT_LEAD_TIME_MINUTES` (HU-38), asi que un estudiante que nunca
 * configuro su propia anticipacion recibe, como minimo, el aviso que el
 * sistema ya programa para todos.
 */
const DEFAULT_SYSTEM_THRESHOLDS_MINUTES = [1440];

/**
 * 30 segundos: la mitad del limite de 60 segundos del criterio 2, para
 * dejar margen a que un ciclo tarde en ejecutarse y aun asi cumplir el
 * margen de emision.
 */
const DEFAULT_POLL_INTERVAL_MS = 30_000;

/** Criterio 2: el margen de emision es 60 segundos; un intervalo mayor no podria garantizarlo nunca. */
const MAX_POLL_INTERVAL_MS = 60_000;

export function readDueDateReminderConfig(env: NodeJS.ProcessEnv = process.env): DueDateReminderConfig {
  const pollIntervalMs = parsePollIntervalMs(env['DUE_DATE_REMINDER_POLL_INTERVAL_MS']);
  const systemThresholds = parseSystemThresholds(env['DUE_DATE_REMINDER_SYSTEM_THRESHOLDS_MINUTES']);
  return { pollIntervalMs, systemThresholds };
}

function parsePollIntervalMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_POLL_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidDueDateReminderConfigError(`DUE_DATE_REMINDER_POLL_INTERVAL_MS debe ser un entero positivo, se recibio "${raw}"`);
  }
  if (parsed > MAX_POLL_INTERVAL_MS) {
    throw new InvalidDueDateReminderConfigError(
      `DUE_DATE_REMINDER_POLL_INTERVAL_MS no puede superar ${MAX_POLL_INTERVAL_MS} ms: el criterio 2 exige emitir dentro de los 60 segundos siguientes al instante previsto`
    );
  }
  return parsed;
}

function parseSystemThresholds(raw: string | undefined): readonly AnticipationThreshold[] {
  const minutesList = raw === undefined || raw.trim() === '' ? DEFAULT_SYSTEM_THRESHOLDS_MINUTES : raw.split(',').map((v) => Number(v.trim()));

  return minutesList.map((minutes) => {
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new InvalidDueDateReminderConfigError(
        `DUE_DATE_REMINDER_SYSTEM_THRESHOLDS_MINUTES debe ser una lista de enteros positivos separados por comas, se recibio "${raw}"`
      );
    }
    return AnticipationThreshold.ofMinutes(minutes);
  });
}
