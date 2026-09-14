import type { ConsentDocumentType, ConsentRecord } from '../../entities/ConsentRecord.js';

export interface ConsentRepositoryPort {
  /** Append-only: cada aceptacion es un hecho nuevo (criterio 5), nunca se sobreescribe. */
  record(consent: ConsentRecord): Promise<void>;
  /** La aceptacion mas reciente, para decidir si sigue vigente (criterios 1, 3). */
  findLatest(studentId: string, documentType: ConsentDocumentType): Promise<ConsentRecord | null>;
  /** Historico completo, mas reciente primero (criterio 6). */
  findHistory(studentId: string, documentType: ConsentDocumentType): Promise<readonly ConsentRecord[]>;
}
