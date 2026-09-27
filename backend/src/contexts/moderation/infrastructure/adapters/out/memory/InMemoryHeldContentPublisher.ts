import type { HeldContentPublisherPort } from '../../../../domain/ports/out/HeldContentPublisherPort.js';
import type { ModeratedContentKind } from '../../../../domain/value-objects/ModerationDecisionInput.js';

/** Solo para pruebas y desarrollo: no existe todavia un almacen de contenido retenido al que publicar (ver el puerto). */
export class InMemoryHeldContentPublisher implements HeldContentPublisherPort {
  readonly published: { contentId: string; contentKind: ModeratedContentKind }[] = [];
  failWith: Error | null = null;

  async publish(contentId: string, contentKind: ModeratedContentKind): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.published.push({ contentId, contentKind });
  }
}
