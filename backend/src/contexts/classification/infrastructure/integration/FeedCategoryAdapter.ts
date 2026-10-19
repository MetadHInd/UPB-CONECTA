import type { FeedCategoryPort } from '../../../feed/domain/ports/out/FeedCategoryPort.js';
import type { ClassificationResultRepositoryPort } from '../../domain/ports/out/ClassificationResultRepositoryPort.js';
import { MESSAGE_CATEGORIES } from '../../domain/value-objects/MessageCategory.js';

/**
 * Implementa el puerto de categorias de `feed` sobre los resultados de
 * clasificacion. Cruza el limite de contexto solo en infraestructura, igual
 * que `FeedStudentSegmentAdapter` en `profile`. Una sola lectura por consulta
 * (como `GetSegmentedFeed`), no una por mensaje.
 */
export class FeedCategoryAdapter implements FeedCategoryPort {
  constructor(private readonly results: Pick<ClassificationResultRepositoryPort, 'findAll'>) {}

  async categoriesFor(messageIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const wanted = new Set(messageIds);
    const map = new Map<string, string>();
    for (const record of await this.results.findAll()) {
      if (wanted.has(record.messageId)) map.set(record.messageId, record.finalCategory);
    }
    return map;
  }

  allowedCategories(): readonly string[] {
    return MESSAGE_CATEGORIES;
  }
}
