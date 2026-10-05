/**
 * HU-49, criterio 6: cuanto tiempo puede pasar un elemento sin resolverse
 * antes de destacarse como pendiente critico — configurable sin
 * redespliegue, mismo patron que `NotificationBatchingConfig` (HU-21) e
 * `IngestionConfig` (HU-01). El valor por defecto (72 horas) es un punto de
 * partida documentado, no calibrado contra datos reales de operacion —
 * mismo tipo de decision que `ReviewThreshold.default()` (HU-10).
 */
export interface ModerationConfig {
  readonly criticalAgeMs: number;
}

export class InvalidModerationConfigError extends Error {
  constructor(motivo: string) {
    super(`Configuracion de moderacion invalida: ${motivo}`);
    this.name = 'InvalidModerationConfigError';
  }
}

const DEFAULT_CRITICAL_AGE_MS = 72 * 60 * 60 * 1000; // 72 horas

export function readModerationConfig(env: NodeJS.ProcessEnv = process.env): ModerationConfig {
  const raw = env['REVIEW_QUEUE_CRITICAL_AGE_MS'];
  if (raw === undefined || raw.trim() === '') return { criticalAgeMs: DEFAULT_CRITICAL_AGE_MS };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidModerationConfigError(`REVIEW_QUEUE_CRITICAL_AGE_MS debe ser un entero positivo, se recibio "${raw}"`);
  }
  return { criticalAgeMs: parsed };
}
