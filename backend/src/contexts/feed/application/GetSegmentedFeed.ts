import type { ConvocatoriaRepositoryPort } from '../domain/ports/out/ConvocatoriaRepositoryPort.js';
import type { StudentSegment } from '../domain/value-objects/StudentSegment.js';
import type { ProgramTargetingRepositoryPort } from '../../targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';
import type { ClassificationResultRepositoryPort } from '../../classification/domain/ports/out/ClassificationResultRepositoryPort.js';
import type { ClassificationRetryQueuePort } from '../../classification/domain/ports/out/ClassificationRetryQueuePort.js';
import { FeedVisibilityPolicy } from '../domain/services/FeedVisibilityPolicy.js';
import { allCommunityTargeting } from '../../targeting/domain/value-objects/ProgramTargeting.js';
import { FacultyProgramResolver } from '../../targeting/domain/services/FacultyProgramResolver.js';

export class GetSegmentedFeed {
  constructor(
    private readonly deps: {
      readonly convocatoriaRepo: ConvocatoriaRepositoryPort;
      readonly programTargetingRepo: ProgramTargetingRepositoryPort;
      readonly facultyResolver: FacultyProgramResolver;
      /**
       * HU-10 (gap 1) + correccion del bug 1: se excluye del feed una
       * convocatoria cuyo mensaje representativo se intento clasificar y no es
       * publicable. Van juntos: el repositorio de resultados dice si quedo
       * `pending-review`, y la cola de reintento dice si el intento termino
       * sin resultado (fallo del proveedor o descarte por regla de HU-09). Un
       * mensaje que no aparece en ninguno de los dos nunca paso por el
       * clasificador (historico previo a HU-06) y se muestra, como antes.
       */
      readonly classificationResultRepo?: ClassificationResultRepositoryPort;
      readonly classificationRetryQueue?: Pick<ClassificationRetryQueuePort, 'contains'>;
    }
  ) {
    // Con solo el repositorio de resultados, un fallo o un descarte volveria a
    // verse como "nunca clasificado" y se publicaria: exactamente el bug 1.
    if (Boolean(deps.classificationResultRepo) !== Boolean(deps.classificationRetryQueue)) {
      throw new Error(
        'GetSegmentedFeed: classificationResultRepo y classificationRetryQueue (cola de reintento de clasificacion) se configuran juntos.'
      );
    }
  }

  async execute(profile: StudentSegment, limit?: number) {
    const entries = await this.deps.convocatoriaRepo.findSegmentedFeed(profile, typeof limit === 'undefined' ? undefined : { limit });
    const policy = new FeedVisibilityPolicy(this.deps.facultyResolver);

    const visible: typeof entries = [];
    for (const entry of entries) {
      // HU-50, criterio 3: una convocatoria retirada deja de ser visible en la siguiente sincronizacion.
      // Chequeo truthy (no `!== null`): fixtures de pruebas previas a HU-50
      // construyen `record` parcial sin declarar `withdrawnAt` (queda
      // `undefined`), y un historico sin este campo nunca fue retirado.
      if (entry.record.withdrawnAt) continue;

      const repMessageId = entry.record.representativeMessageId;
      if (!repMessageId) continue; // cannot resolve targeting without messageId

      if (await this.isUnpublishable(repMessageId)) continue;

      const targetingRecord = await this.deps.programTargetingRepo.findByMessageId(repMessageId);
      const targeting = targetingRecord ? targetingRecord.targeting : allCommunityTargeting();

      if (policy.isVisible(targeting, profile, targetingRecord?.semesterRange ?? null)) {
        visible.push(entry);
      }
    }

    // If profile.program is missing, signal incomplete profile along with feed.
    const incompleteProfile = !profile.program;
    return { feed: visible, incompleteProfile };
  }

  /**
   * El registro de clasificacion manda: si existe, decide su estado (un
   * mensaje que fallo y luego se clasifico con exito vuelve a verse aunque su
   * entrada vieja siga en la cola). Sin registro, estar en la cola significa
   * "se intento y no es publicable".
   */
  private async isUnpublishable(messageId: string): Promise<boolean> {
    const { classificationResultRepo, classificationRetryQueue } = this.deps;
    if (!classificationResultRepo || !classificationRetryQueue) return false;
    const classification = await classificationResultRepo.findByMessageId(messageId);
    if (classification) return classification.publicationStatus === 'pending-review';
    return classificationRetryQueue.contains(messageId);
  }
}
