import type { IngestionRunLogRepositoryPort } from '../../../../domain/ports/out/IngestionRunLogRepositoryPort.js';
import type { IngestionRunLog } from '../../../../domain/entities/IngestionRunLog.js';

export class InMemoryIngestionRunLogRepository implements IngestionRunLogRepositoryPort {
  readonly saved: IngestionRunLog[] = [];

  async save(log: IngestionRunLog): Promise<void> {
    this.saved.push(log);
  }
}
