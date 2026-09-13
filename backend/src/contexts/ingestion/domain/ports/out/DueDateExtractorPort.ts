import type { InstitutionalMessage } from '../../entities/InstitutionalMessage.js';
import type { DueDate } from '../../value-objects/DueDate.js';

export interface DueDateExtraction {
  readonly dueDate: DueDate;
  /** Criterio 5: enlace de postulación o de ampliación de información, si el mensaje lo declara. */
  readonly applicationLink: string | null;
}

/**
 * Puerto de salida hacia la interpretacion de fecha de cierre y enlace de
 * postulacion (HU-08). Vive fuera del dominio porque es interpretacion de
 * lenguaje natural sobre texto — el mismo criterio que ya ubico el
 * normalizador MIME de HU-02 en infraestructura.
 */
export interface DueDateExtractorPort {
  extract(message: InstitutionalMessage): DueDateExtraction;
}
