import type { ClassificationResultRepositoryPort } from '../../classification/domain/ports/out/ClassificationResultRepositoryPort.js';
import type { ClassificationCorrectionRepositoryPort } from '../../classification/domain/ports/out/ClassificationCorrectionRepositoryPort.js';
import type { LabeledSample, LabeledSampleRepositoryPort } from '../../classification/domain/ports/out/LabeledSampleRepositoryPort.js';
import type { QuarantineRepositoryPort } from '../../ingestion/domain/ports/out/QuarantineRepositoryPort.js';
import { MessageCategory } from '../../classification/domain/value-objects/MessageCategory.js';
import { ComputeClassificationPrecision, type PrecisionMetricResult } from '../../classification/application/ComputeClassificationPrecision.js';
import { ComputeCoverageMetric, type CoverageMetricResult } from '../../classification/application/ComputeCoverageMetric.js';
import { ComputeManualCorrectionRate, type ManualCorrectionRateResult } from '../../classification/application/ComputeManualCorrectionRate.js';
import { DashboardPeriod } from '../domain/value-objects/DashboardPeriod.js';
import { evaluateMetricAlert, type DashboardMetricAlert } from '../domain/services/DashboardAlertPolicy.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';

/**
 * HU-51: umbrales objetivo que no tienen ya una fuente de verdad en otro
 * contexto. Precision (RNF-25) y cobertura (RNF-26) reutilizan el umbral que
 * ya trae el resultado de `ComputeClassificationPrecision`/`ComputeCoverageMetric`
 * (`minimumPrecision`/`minimumCoverage`) — no se duplica esa constante aqui.
 *
 * Proporcion de cuarentena y tasa de correccion manual no tienen un umbral
 * objetivo documentado en ningun otro contexto de este repositorio (a
 * diferencia de precision/cobertura, RNF-25/RNF-26 no fijan una cifra para
 * estas dos). Mismo tratamiento que `ReviewThreshold.default()` (HU-10): un
 * punto de partida documentado, **no calibrado con datos reales** — un
 * administrador debe ajustarlo con la operacion real del clasificador.
 */
export const DEFAULT_MAXIMUM_QUARANTINE_PROPORTION = 0.2;
export const DEFAULT_MAXIMUM_MANUAL_CORRECTION_RATE = 0.3;

export interface DashboardThresholds {
  readonly maximumQuarantineProportion: number;
  readonly maximumManualCorrectionRate: number;
}

export interface DashboardVolumeMetric {
  /** Mensajes que completaron el pipeline y se clasificaron con exito en el periodo. */
  readonly classified: number;
  /** Mensajes que quedaron en cuarentena (HU-04) en el periodo, sin poder clasificarse. */
  readonly quarantined: number;
  /** classified + quarantined: el volumen ingerido del periodo (criterio 1). */
  readonly total: number;
}

export interface DashboardQuarantineMetric {
  readonly quarantined: number;
  readonly total: number;
  /** quarantined / total, o null si no hubo ningun mensaje ingerido en el periodo. */
  readonly proportion: number | null;
}

export interface OperationsDashboard {
  readonly period: { readonly from: Date; readonly to: Date };
  readonly generatedAt: Date;
  /** Criterio 1. */
  readonly volume: DashboardVolumeMetric;
  /** Criterio 2. */
  readonly quarantine: DashboardQuarantineMetric;
  /** Criterio 3. */
  readonly manualCorrectionRate: ManualCorrectionRateResult;
  /** Criterio 4 (mitad precision). Categoria fija: convocatoria con plazo, tal como dice el criterio literalmente. */
  readonly precision: PrecisionMetricResult;
  /** Criterio 4 (mitad cobertura). */
  readonly coverage: CoverageMetricResult;
  /** Criterio 6: una entrada por cada metrica con umbral objetivo, con su estado (sin-datos / normal / alerta). */
  readonly alerts: readonly DashboardMetricAlert[];
}

export interface GetOperationsDashboardCommand {
  readonly from: Date;
  readonly to: Date;
  /** Umbrales objetivo de cuarentena/correccion manual; sin especificar, se usan los valores por defecto documentados arriba. */
  readonly thresholds?: Partial<DashboardThresholds>;
}

export interface GetOperationsDashboardDependencies {
  readonly classificationResultRepo: ClassificationResultRepositoryPort;
  readonly quarantineRepo: QuarantineRepositoryPort;
  readonly correctionRepo: ClassificationCorrectionRepositoryPort;
  readonly labeledSampleRepo: LabeledSampleRepositoryPort;
  readonly clock: ClockPort;
}

/**
 * HU-51 (RF-75, RNF-25, RNF-26, RNF-28): orquesta hechos ya registrados por
 * `classification` (HU-10, HU-11) e `ingestion` (HU-04) en un tablero de solo
 * lectura. No introduce logica de negocio nueva — como dice el diseno de la
 * historia, "agrega y presenta hechos ya registrados": este caso de uso solo
 * filtra por periodo (criterio 5) y delega el calculo a
 * `ComputeClassificationPrecision`, `ComputeCoverageMetric` y
 * `ComputeManualCorrectionRate`, que ya existen desde HU-10/HU-11 con sus
 * propias pruebas. Ver el README de este contexto para las decisiones de
 * diseno completas (por que la categoria de precision/cobertura es fija, y
 * por que la muestra etiquetada se restringe por periodo de forma indirecta).
 */
export class GetOperationsDashboard {
  constructor(private readonly deps: GetOperationsDashboardDependencies) {}

  async execute(command: GetOperationsDashboardCommand): Promise<OperationsDashboard> {
    const period = DashboardPeriod.of(command.from, command.to);
    const thresholds: DashboardThresholds = {
      maximumQuarantineProportion: command.thresholds?.maximumQuarantineProportion ?? DEFAULT_MAXIMUM_QUARANTINE_PROPORTION,
      maximumManualCorrectionRate: command.thresholds?.maximumManualCorrectionRate ?? DEFAULT_MAXIMUM_MANUAL_CORRECTION_RATE
    };

    const [allRecords, allQuarantined, allCorrections, allLabeledSample] = await Promise.all([
      this.deps.classificationResultRepo.findAll(),
      this.deps.quarantineRepo.findAll(),
      this.deps.correctionRepo.findAll(),
      this.deps.labeledSampleRepo.findAll()
    ]);

    const recordsInPeriod = allRecords.filter((record) => period.includes(record.persistedAt));
    const quarantinedInPeriod = allQuarantined.filter((message) => period.includes(message.quarantinedAt));
    const correctionsInPeriod = allCorrections.filter((correction) => period.includes(correction.correctedAt));
    const labeledSampleInPeriod = this.restrictLabeledSampleToPeriod(allLabeledSample, recordsInPeriod);

    const volume: DashboardVolumeMetric = {
      classified: recordsInPeriod.length,
      quarantined: quarantinedInPeriod.length,
      total: recordsInPeriod.length + quarantinedInPeriod.length
    };

    const quarantine: DashboardQuarantineMetric = {
      quarantined: quarantinedInPeriod.length,
      total: volume.total,
      proportion: volume.total === 0 ? null : quarantinedInPeriod.length / volume.total
    };

    const manualCorrectionRate = new ComputeManualCorrectionRate().execute(recordsInPeriod, correctionsInPeriod);
    const precision = new ComputeClassificationPrecision().execute(
      recordsInPeriod,
      labeledSampleInPeriod,
      MessageCategory.CONVOCATORIA_CON_PLAZO
    );
    const coverage = new ComputeCoverageMetric().execute(
      recordsInPeriod,
      labeledSampleInPeriod,
      MessageCategory.CONVOCATORIA_CON_PLAZO
    );

    const alerts: DashboardMetricAlert[] = [
      evaluateMetricAlert('proporcionCuarentena', quarantine.proportion, thresholds.maximumQuarantineProportion, 'no-debe-superar'),
      evaluateMetricAlert('tasaCorreccionManual', manualCorrectionRate.rate, thresholds.maximumManualCorrectionRate, 'no-debe-superar'),
      evaluateMetricAlert('precision', precision.precision, precision.minimumPrecision, 'no-debe-caer-bajo'),
      evaluateMetricAlert('cobertura', coverage.coverage, coverage.minimumCoverage, 'no-debe-caer-bajo')
    ];

    return {
      period: { from: period.from, to: period.to },
      generatedAt: this.deps.clock.now(),
      volume,
      quarantine,
      manualCorrectionRate,
      precision,
      coverage,
      alerts
    };
  }

  /**
   * `LabeledSample` (HU-10) no persiste fecha propia — es un corpus de
   * validacion sin periodo intrinseco (ver README de `classification`, HU-10
   * gap 3). Para que precision y cobertura "se recalculen sobre ese rango"
   * (criterio 5) de forma coherente con las demas metricas, se restringe la
   * muestra etiquetada a los mensajes que SI tienen un registro de
   * clasificacion dentro del periodo — el unico dato temporal disponible que
   * los conecta. Un mensaje etiquetado cuyo registro de clasificacion cae
   * fuera del periodo elegido no participa en el calculo para ese periodo.
   */
  private restrictLabeledSampleToPeriod(
    labeledSample: readonly LabeledSample[],
    recordsInPeriod: readonly { messageId: string }[]
  ): readonly LabeledSample[] {
    const messageIdsInPeriod = new Set(recordsInPeriod.map((record) => record.messageId));
    return labeledSample.filter((sample) => messageIdsInPeriod.has(sample.messageId));
  }
}
