import type { ClassificationResultRecord } from '../../entities/ClassificationResult.js';

export interface ClassificationResultRepositoryPort {
  save(record: ClassificationResultRecord): Promise<void>;
  /** HU-10, gap 1: usado por el feed para excluir documentos en revision pendiente. */
  findByMessageId(messageId: string): Promise<ClassificationResultRecord | null>;
  /** HU-10, criterios 5 y 6: fuente de registros para calcular precision y cobertura. */
  findAll(): Promise<readonly ClassificationResultRecord[]>;
}
