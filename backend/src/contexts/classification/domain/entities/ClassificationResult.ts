import { isMessageCategory, type MessageCategory } from '../value-objects/MessageCategory.js';

export interface ClassificationResultRecord {
  readonly messageId: string;
  readonly proposedCategory: MessageCategory;
  readonly finalCategory: MessageCategory;
  readonly isKnownFalsePositiveCase: boolean;
  readonly reason: string | null;
  readonly persistedAt: Date;
}

export class ClassificationResult {
  constructor(
    readonly proposedCategory: MessageCategory,
    readonly finalCategory: MessageCategory = proposedCategory,
    readonly isKnownFalsePositiveCase: boolean = false,
    readonly reason?: string
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
    overrides: Partial<Pick<ClassificationResult, 'finalCategory' | 'isKnownFalsePositiveCase' | 'reason'>> = {}
  ): ClassificationResult {
    return new ClassificationResult(
      category,
      overrides.finalCategory ?? category,
      overrides.isKnownFalsePositiveCase ?? false,
      overrides.reason
    );
  }

  toPersistedRecord(messageId: string, persistedAt: Date = new Date()): ClassificationResultRecord {
    return {
      messageId,
      proposedCategory: this.proposedCategory,
      finalCategory: this.finalCategory,
      isKnownFalsePositiveCase: this.isKnownFalsePositiveCase,
      reason: this.reason ?? null,
      persistedAt
    };
  }
}
