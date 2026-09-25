import type { ProgramTargeting } from '../../value-objects/ProgramTargeting.js';
import type { SemesterRange } from '../../value-objects/SemesterRange.js';

export interface ProgramTargetingRecord {
  readonly messageId: string;
  readonly targeting: ProgramTargeting;
  /** HU-37: filtro de semestre ortogonal al programa. Ausente o `null` = sin restriccion. */
  readonly semesterRange?: SemesterRange | null;
  readonly persistedAt: Date;
}

export interface ProgramTargetingRepositoryPort {
  save(record: ProgramTargetingRecord): Promise<void>;
  findByMessageId(messageId: string): Promise<ProgramTargetingRecord | null>;
  /**
   * HU-55, criterio 2: version en lote de `findByMessageId`. El feed segmentado
   * (`GetSegmentedFeed`) resuelve targeting para todas las entradas de una
   * pagina de una sola vez en vez de una consulta por entrada (N+1 real con
   * 20k documentos consolidados) — mismo principio que
   * `ClassificationResultRepositoryPort.findAll()` para el chequeo de
   * publicabilidad. Aditivo: no reemplaza `findByMessageId`, que sigue
   * usandose donde solo hace falta resolver un mensaje puntual (por ejemplo,
   * HU-19/HU-30/moderacion).
   */
  findByMessageIds(messageIds: readonly string[]): Promise<ReadonlyMap<string, ProgramTargetingRecord>>;
}
