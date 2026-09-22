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
  /**
   * Correccion del bug 1: `true` si el mensaje se intento clasificar y termino
   * en esta cola (fallo del proveedor o descarte por regla). El feed lo usa
   * para distinguir "se intento y no es publicable" de "nunca se clasifico".
   */
  contains(messageId: string): Promise<boolean>;
}
