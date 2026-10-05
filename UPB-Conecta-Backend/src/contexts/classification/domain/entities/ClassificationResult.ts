import { isMessageCategory, type MessageCategory } from '../value-objects/MessageCategory.js';
import { ConfidenceScore } from '../value-objects/ConfidenceScore.js';

/**
 * Estado de publicacion (HU-10, RF-15, criterios 2 y 3): 'published' significa
 * visible en el feed; 'pending-review' significa retenido para revision
 * humana porque el puntaje de confianza no alcanzo el umbral configurado.
 * Por defecto es 'published' — el mismo comportamiento que existia antes de
 * HU-10, cuando este concepto no existia y todo se consideraba publicable.
 */
export type PublicationStatus = 'published' | 'pending-review';

export interface ClassificationResultRecord {
  readonly messageId: string;
  readonly proposedCategory: MessageCategory;
  readonly finalCategory: MessageCategory;
  readonly isKnownFalsePositiveCase: boolean;
  readonly reason: string | null;
  /**
   * Id de la regla de posprocesamiento (HU-09, RF-13) que confirmo o corrigio
   * la categoria propuesta, o null si ninguna regla activa aplico al mensaje.
   * Se reutiliza `reason` para explicar el porque; este campo identifica
   * ademas el que.
   */
  readonly appliedRuleId: string | null;
  /** HU-10, criterio 1: puntaje de confianza persistido junto al documento. */
  readonly confidenceScore: number;
  /** HU-10, criterios 2 y 3. */
  readonly publicationStatus: PublicationStatus;
  readonly persistedAt: Date;
}

export class ClassificationResult {
  constructor(
    readonly proposedCategory: MessageCategory,
    readonly finalCategory: MessageCategory = proposedCategory,
    readonly isKnownFalsePositiveCase: boolean = false,
    readonly reason?: string,
    readonly appliedRuleId?: string,
    readonly confidenceScore: ConfidenceScore = ConfidenceScore.certain()
  ) {
    if (!isMessageCategory(this.proposedCategory)) {
      throw new TypeError(`Categoria propuesta invalida: ${String(this.proposedCategory)}`);
    }
    if (!isMessageCategory(this.finalCategory)) {
      throw new TypeError(`Categoria definitiva invalida: ${String(this.finalCategory)}`);
    }
  }

  static fromCategory(
    category: MessageCategory,
    overrides: Partial<
      Pick<
        ClassificationResult,
        'finalCategory' | 'isKnownFalsePositiveCase' | 'reason' | 'appliedRuleId' | 'confidenceScore'
      >
    > = {}
  ): ClassificationResult {
    return new ClassificationResult(
      category,
      overrides.finalCategory ?? category,
      overrides.isKnownFalsePositiveCase ?? false,
      overrides.reason,
      overrides.appliedRuleId,
      overrides.confidenceScore ?? ConfidenceScore.certain()
    );
  }

  /**
   * `publicationStatus` es una decision externa (politica de dominio +
   * umbral configurado, ver `PublicationDecisionPolicy`), no algo que este
   * objeto pueda calcular por si solo — por eso se recibe como parametro en
   * vez de derivarse aqui. El valor por defecto ('published') preserva el
   * comportamiento anterior a HU-10 para quien no pase el parametro.
   */
  toPersistedRecord(
    messageId: string,
    persistedAt: Date = new Date(),
    publicationStatus: PublicationStatus = 'published'
  ): ClassificationResultRecord {
    return {
      messageId,
      proposedCategory: this.proposedCategory,
      finalCategory: this.finalCategory,
      isKnownFalsePositiveCase: this.isKnownFalsePositiveCase,
      reason: this.reason ?? null,
      appliedRuleId: this.appliedRuleId ?? null,
      confidenceScore: this.confidenceScore.value,
      publicationStatus,
      persistedAt
    };
  }
}
