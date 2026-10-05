import type { IngestionRunLog } from '../../entities/IngestionRunLog.js';

export interface IngestionRunLogRepositoryPort {
  save(log: IngestionRunLog): Promise<void>;
}
