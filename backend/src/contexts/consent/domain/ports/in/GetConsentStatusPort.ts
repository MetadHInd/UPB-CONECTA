import type { ConsentDocumentType, ConsentRecord } from '../../entities/ConsentRecord.js';
import type { ConsentStatus } from '../../services/ConsentPolicy.js';

export interface GetConsentStatusQuery {
  readonly studentId: string;
  readonly documentType: ConsentDocumentType;
  readonly currentVersion: string;
}

export interface ConsentStatusResult {
  readonly status: ConsentStatus;
  /** Criterio 6: historico completo, mas reciente primero. */
  readonly history: readonly ConsentRecord[];
}

export interface GetConsentStatusPort {
  execute(query: GetConsentStatusQuery): Promise<ConsentStatusResult>;
}
