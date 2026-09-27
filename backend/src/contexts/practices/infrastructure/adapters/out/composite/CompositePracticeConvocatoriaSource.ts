import type { ClassificationResultRecord } from '../../../../../classification/domain/entities/ClassificationResult.js';
import type { ClassificationResultRepositoryPort } from '../../../../../classification/domain/ports/out/ClassificationResultRepositoryPort.js';
import { MessageCategory } from '../../../../../classification/domain/value-objects/MessageCategory.js';
import type { ConsolidatedMessageRegistryPort } from '../../../../../ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { ProgramTargetingRepositoryPort } from '../../../../../targeting/domain/ports/out/ProgramTargetingRepositoryPort.js';
import { allCommunityTargeting } from '../../../../../targeting/domain/value-objects/ProgramTargeting.js';
import type { PracticeConvocatoriaSnapshot, PracticeConvocatoriaSourcePort } from '../../../../domain/ports/out/PracticeConvocatoriaSourcePort.js';
import type { PracticeOfferRepositoryPort } from '../../../../domain/ports/out/PracticeOfferRepositoryPort.js';

/**
 * Une, sin distinguir origen, lo que ya guardan cuatro repositorios: el
 * registro consolidado (ingestion), la clasificacion, la segmentacion y el
 * detalle de practica. Una oferta ingerida y una cargada a mano quedan
 * escritas en los mismos tres primeros (HU-24 publica por
 * `PublishConvocatoria`), asi que aqui no hay dos rutas de lectura.
 *
 * Resuelve todo en lote (un `findAll` de clasificacion mas una consulta por
 * repositorio), como el feed (HU-55): sin una consulta por oferta.
 */
export class CompositePracticeConvocatoriaSource implements PracticeConvocatoriaSourcePort {
  constructor(
    private readonly dependencies: {
      readonly registry: ConsolidatedMessageRegistryPort;
      readonly classifications: ClassificationResultRepositoryPort;
      readonly targeting: ProgramTargetingRepositoryPort;
      readonly offers: PracticeOfferRepositoryPort;
    }
  ) {}

  async findPracticeConvocatorias(): Promise<readonly PracticeConvocatoriaSnapshot[]> {
    const results = await this.dependencies.classifications.findAll();
    return this.assemble(results.filter((result) => result.finalCategory === MessageCategory.PRACTICA));
  }

  async findPracticeConvocatoria(messageId: string): Promise<PracticeConvocatoriaSnapshot | null> {
    const result = await this.dependencies.classifications.findByMessageId(messageId);
    if (result === null || result.finalCategory !== MessageCategory.PRACTICA) return null;
    return (await this.assemble([result]))[0] ?? null;
  }

  private async assemble(results: readonly ClassificationResultRecord[]): Promise<PracticeConvocatoriaSnapshot[]> {
    const { registry, targeting, offers } = this.dependencies;
    const messageIds = results.map((result) => result.messageId);
    const [records, targetings, details] = await Promise.all([
      registry.findByRepresentativeMessageIds(messageIds),
      targeting.findByMessageIds(messageIds),
      offers.findByMessageIds(messageIds)
    ]);
    const recordById = new Map(records.map((record) => [record.representativeMessageId, record]));

    const snapshots: PracticeConvocatoriaSnapshot[] = [];
    for (const result of results) {
      const record = recordById.get(result.messageId);
      if (!record) continue; // clasificacion sin convocatoria consolidada: nada que mostrar
      snapshots.push({
        messageId: result.messageId,
        record,
        category: result.finalCategory,
        publicationStatus: result.publicationStatus,
        // Igual que el feed: sin segmentacion guardada, es para toda la comunidad.
        targeting: targetings.get(result.messageId)?.targeting ?? allCommunityTargeting(),
        details: details.get(result.messageId) ?? null
      });
    }
    return snapshots;
  }
}
