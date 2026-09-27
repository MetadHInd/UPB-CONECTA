import type { ModeratedContentKind } from '../../value-objects/ModerationDecisionInput.js';

/**
 * Publica un contenido que estaba retenido (criterio 4). El foro aun no
 * retiene contenido antes de publicarlo (eso llega con HU-31), asi que no
 * existe adaptador real: el que lo escriba debe hacer visible el contenido
 * retenido en su almacen. La operacion debe ser idempotente.
 */
export interface HeldContentPublisherPort {
  publish(contentId: string, contentKind: ModeratedContentKind): Promise<void>;
}
