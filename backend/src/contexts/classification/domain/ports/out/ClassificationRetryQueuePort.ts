import type { InstitutionalMessage } from '../../../../ingestion/domain/entities/InstitutionalMessage.js';
import type { MessageCategory } from '../../value-objects/MessageCategory.js';

export interface ClassificationRetryEntry {
  readonly messageId: string;
  readonly message: InstitutionalMessage;
  readonly error: string;
  readonly createdAt: Date;
  /**
   * Presentes solo cuando la entrada llega por una regla de posprocesamiento
   * que descarto la clasificacion (HU-09, RF-13/RF-14), no por un fallo del
   * proveedor. Ver README de classification: decision sobre "descartar".
   */
  readonly discardedByRuleId?: string;
  readonly proposedCategory?: MessageCategory;
}

export interface ClassificationRetryQueuePort {
  save(entry: ClassificationRetryEntry): Promise<void>;
}
