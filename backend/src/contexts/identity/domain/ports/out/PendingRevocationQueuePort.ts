import type { PendingRevocation } from '../../entities/PendingRevocation.js';

/** Cola durable en el cliente de revocaciones por reintentar (HU-39, criterio 5). */
export interface PendingRevocationQueuePort {
  enqueue(item: PendingRevocation): Promise<void>;
  /** Copia de las pendientes, de la mas antigua a la mas reciente. */
  list(): Promise<readonly PendingRevocation[]>;
  remove(item: PendingRevocation): Promise<void>;
}
