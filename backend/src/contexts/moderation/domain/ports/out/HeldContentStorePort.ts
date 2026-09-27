import type { RetainedContent } from '../../entities/RetainedContent.js';

/**
 * Cola de revisión humana del contenido retenido por moderación automática
 * (HU-31 criterio 4). Es distinta de la cola de ingesta de HU-49: aquella
 * agrupa mensajes institucionales; esta, contenido de estudiantes.
 */
export interface HeldContentStorePort {
  /** Idempotente por `id`: reintentar no duplica el elemento. */
  enqueue(content: RetainedContent): Promise<void>;
  /** Más antiguo primero. */
  findPending(): Promise<readonly RetainedContent[]>;
  /** Copia completa retenida, o `null` si no existe (o ya se retiró del almacén). */
  findById(id: string): Promise<RetainedContent | null>;
  /** Retira la copia una vez publicada. Idempotente: no falla si no existe. */
  remove(id: string): Promise<void>;
}
