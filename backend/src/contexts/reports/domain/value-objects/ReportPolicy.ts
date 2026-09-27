/**
 * Politica de reportes de la comunidad (HU-34 criterios 1, 4 y 6) como datos
 * (`config/community-reports.json`), no constantes: el umbral de ocultamiento,
 * las causas admitidas y el umbral de abuso se ajustan sin redespliegue.
 *
 * Los valores por defecto (3 reportes distintos ocultan; 3 reportes
 * infundados en 90 dias marcan a la cuenta) son un punto de partida
 * documentado, no calibrado con datos reales del foro.
 */
export interface ReportCauseDefinition {
  readonly id: string;
  readonly label: string;
  /** La causa "otra" exige una explicacion: sin ella el administrador no puede evaluar el reporte. */
  readonly requiresDetail?: boolean;
}

export interface ReportPolicyValues {
  /**
   * Cantidad de reportes DISTINTOS (un usuario cuenta una vez) que oculta el
   * contenido. Se oculta al alcanzarla: ante la duda, ocultar (RNF-11).
   */
  readonly hideThreshold: number;
  readonly causes: readonly ReportCauseDefinition[];
  readonly abuse: {
    /** Reportes infundados de una misma cuenta, dentro de la ventana, que la marcan para revision. */
    readonly unfoundedReportsThreshold: number;
    readonly windowDays: number;
  };
}

export class InvalidReportPolicyError extends Error {
  constructor(motivo: string) {
    super(`Politica de reportes invalida: ${motivo}`);
    this.name = 'InvalidReportPolicyError';
  }
}

export const REPORT_DETAIL_MAX = 500;

const DAY_MS = 86_400_000;

export class ReportPolicy {
  private constructor(readonly values: ReportPolicyValues) {}

  static of(values: ReportPolicyValues): ReportPolicy {
    const positive = (field: string, value: number): void => {
      if (!Number.isInteger(value) || value <= 0) {
        throw new InvalidReportPolicyError(`${field} debe ser un entero positivo, se recibio ${String(value)}`);
      }
    };
    positive('hideThreshold', values.hideThreshold);
    positive('abuse.unfoundedReportsThreshold', values.abuse.unfoundedReportsThreshold);
    positive('abuse.windowDays', values.abuse.windowDays);
    if (values.causes.length === 0) throw new InvalidReportPolicyError('debe haber al menos una causa');
    const ids = values.causes.map((cause) => cause.id.trim());
    if (ids.some((id) => id === '') || new Set(ids).size !== ids.length) {
      throw new InvalidReportPolicyError('las causas necesitan un id no vacio y sin repetir');
    }
    return new ReportPolicy(values);
  }

  get hideThreshold(): number {
    return this.values.hideThreshold;
  }

  findCause(id: string): ReportCauseDefinition | null {
    return this.values.causes.find((cause) => cause.id === id) ?? null;
  }

  causeLabel(id: string): string {
    return this.findCause(id)?.label ?? id;
  }

  get abuseWindowMs(): number {
    return this.values.abuse.windowDays * DAY_MS;
  }

  get abuseThreshold(): number {
    return this.values.abuse.unfoundedReportsThreshold;
  }
}
