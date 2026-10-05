import type { IngestionRunLog } from '../../entities/IngestionRunLog.js';

/** Puerto de entrada que consumen el planificador y el backoffice administrativo. */
export interface IngestInstitutionalMessagesPort {
  execute(): Promise<IngestionRunLog>;
}
