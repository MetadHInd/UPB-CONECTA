/**
 * Umbrales de la gradualidad (HU-35 criterios 1 y 7): cuantas infracciones
 * computables llevan a cada nivel y cuanto dura cada suspension. Es un dato
 * que el administrador ajusta (`ManageSanctionThresholds`), no una constante:
 * mismo patron que `ReviewThreshold` (HU-10).
 *
 * Los valores por defecto son un punto de partida documentado, no calibrado
 * con datos reales del foro: 1 infraccion advierte, 3 suspenden 7 dias y 5
 * suspenden 30 dias, contando solo las de los ultimos 180 dias.
 */
export interface SanctionThresholdValues {
  readonly warningAt: number;
  readonly temporarySuspensionAt: number;
  readonly temporarySuspensionDays: number;
  readonly extendedSuspensionAt: number;
  readonly extendedSuspensionDays: number;
  /** Solo computan las infracciones de esta ventana: una falta vieja no escala para siempre. */
  readonly countingWindowDays: number;
}

export class InvalidSanctionThresholdsError extends Error {
  constructor(motivo: string) {
    super(`Umbrales de sancion invalidos: ${motivo}`);
    this.name = 'InvalidSanctionThresholdsError';
  }
}

const DAY_MS = 86_400_000;

const DEFAULTS: SanctionThresholdValues = {
  warningAt: 1,
  temporarySuspensionAt: 3,
  temporarySuspensionDays: 7,
  extendedSuspensionAt: 5,
  extendedSuspensionDays: 30,
  countingWindowDays: 180
};

export class SanctionThresholds {
  private constructor(readonly values: SanctionThresholdValues) {}

  static of(values: SanctionThresholdValues): SanctionThresholds {
    for (const [field, value] of Object.entries(values)) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new InvalidSanctionThresholdsError(`${field} debe ser un entero positivo, se recibio ${String(value)}`);
      }
    }
    if (!(values.warningAt < values.temporarySuspensionAt && values.temporarySuspensionAt < values.extendedSuspensionAt)) {
      throw new InvalidSanctionThresholdsError('los niveles deben crecer: advertencia < suspension temporal < suspension prolongada');
    }
    if (values.extendedSuspensionDays <= values.temporarySuspensionDays) {
      throw new InvalidSanctionThresholdsError('la suspension prolongada debe durar mas que la temporal');
    }
    return new SanctionThresholds({ ...values });
  }

  static default(): SanctionThresholds {
    return new SanctionThresholds(DEFAULTS);
  }

  get countingWindowMs(): number {
    return this.values.countingWindowDays * DAY_MS;
  }

  get temporarySuspensionMs(): number {
    return this.values.temporarySuspensionDays * DAY_MS;
  }

  get extendedSuspensionMs(): number {
    return this.values.extendedSuspensionDays * DAY_MS;
  }
}
