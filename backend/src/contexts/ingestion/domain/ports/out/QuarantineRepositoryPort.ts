import type { QuarantinedMessage } from '../../entities/QuarantinedMessage.js';

export interface QuarantineRepositoryPort {
  save(message: QuarantinedMessage): Promise<void>;
  /** Criterio 3: permite consultar el contenido crudo original para diagnostico. */
  findByUid(mailboxUid: number): Promise<QuarantinedMessage | null>;
}
