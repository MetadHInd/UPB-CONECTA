import type { MessageCategory } from '../../value-objects/MessageCategory.js';

/**
 * HU-11, criterio 5: una entrada del historial de correcciones manuales,
 * distinta de `LabeledSample` (HU-10). `LabeledSample` upsertea por
 * `messageId` — guarda "la mejor verdad actual" para el corpus de
 * precision/cobertura. Este registro es un log de auditoria append-only:
 * un mismo documento puede corregirse mas de una vez, y cada correccion es
 * un hecho que se conserva, no un estado que se reemplaza.
 */
export interface ClassificationCorrectionRecord {
  readonly messageId: string;
  /** Categoria que propuso el modelo originalmente, sin tocar. */
  readonly proposedCategory: MessageCategory;
  /** Categoria definitiva justo antes de esta correccion. */
  readonly previousFinalCategory: MessageCategory;
  /** Categoria que fijo el administrador de contenido. */
  readonly correctedCategory: MessageCategory;
  readonly correctedAt: Date;
}

export interface ClassificationCorrectionRepositoryPort {
  save(record: ClassificationCorrectionRecord): Promise<void>;
  /** HU-11, criterio 5: fuente del historico para calcular la tasa de correccion manual. */
  findAll(): Promise<readonly ClassificationCorrectionRecord[]>;
}
