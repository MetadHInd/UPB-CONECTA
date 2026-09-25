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

    // HU-55, criterio 2: filtro sin I/O primero (retirada / sin mensaje
    // representativo), para no cargar targeting ni clasificacion de entradas
    // que de todas formas quedan fuera. Con 20k documentos consolidados, esto
    // tambien acota el tamano del lote que se resuelve en batch mas abajo.
    const candidates = entries.filter((entry) => {
      // HU-50, criterio 3: una convocatoria retirada deja de ser visible en la siguiente sincronizacion.
      // Chequeo truthy (no `!== null`): fixtures de pruebas previas a HU-50
      // construyen `record` parcial sin declarar `withdrawnAt` (queda
      // `undefined`), y un historico sin este campo nunca fue retirado.
      if (entry.record.withdrawnAt) return false;
      return Boolean(entry.record.representativeMessageId); // sin messageId no se puede resolver targeting
    });
    const messageIds = candidates.map((entry) => entry.record.representativeMessageId!);

    // HU-55, criterio 2 (correccion N+1): antes de esta correccion, targeting
    // y clasificacion se resolvian con una consulta async por entrada dentro
    // del loop — con 20k documentos, decenas de miles de consultas
    // secuenciales a Mongo. Ahora se resuelven en un unico lote cada uno,
    // antes del loop, y el loop solo hace lookups en memoria.
    const [unpublishable, targetingByMessageId] = await Promise.all([
      this.isUnpublishable(messageIds),
      this.deps.programTargetingRepo.findByMessageIds(messageIds)
    ]);

    const visible: typeof entries = [];
    for (const entry of candidates) {
      const repMessageId = entry.record.representativeMessageId!;
      if (unpublishable.has(repMessageId)) continue;

      const targetingRecord = targetingByMessageId.get(repMessageId) ?? null;
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
   *
   * HU-55, criterio 2: `classificationResultRepo.findAll()` (ya existente,
   * usado por HU-10 para metricas de precision/cobertura) reemplaza aqui N
   * consultas `findByMessageId` por una sola. `classificationRetryQueue`
   * conserva su firma puntual (`contains`): solo se consulta para los
   * mensajes sin registro de clasificacion (el caso "se intento y fallo" es
   * casi siempre una fraccion pequena del total, no los 20k documentos).
   */
  private async isUnpublishable(messageIds: readonly string[]): Promise<ReadonlySet<string>> {
    const { classificationResultRepo, classificationRetryQueue } = this.deps;
    const unpublishable = new Set<string>();
    if (!classificationResultRepo || !classificationRetryQueue) return unpublishable;

    const results = await classificationResultRepo.findAll();
    const resultByMessageId = new Map(results.map((record) => [record.messageId, record]));

    for (const messageId of messageIds) {
      const classification = resultByMessageId.get(messageId);
      if (classification) {
        if (classification.publicationStatus === 'pending-review') unpublishable.add(messageId);
        continue;
      }
      if (await classificationRetryQueue.contains(messageId)) unpublishable.add(messageId);
    }
    return unpublishable;
  }
}
