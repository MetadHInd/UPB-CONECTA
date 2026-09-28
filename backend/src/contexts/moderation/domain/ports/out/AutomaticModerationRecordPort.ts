import type { AutomaticModerationRecord, HumanModerationResolution } from '../../entities/AutomaticModerationRecord.js';

/**
 * Registro de decisiones automáticas (HU-52 criterios 4 y 5). Append-only:
 * `record` inserta y `appendResolution` solo agrega al final de
 * `resolutions`; ninguna operación reescribe la decisión automática.
 */
export interface AutomaticModerationRecordPort {
  record(entry: AutomaticModerationRecord): Promise<void>;
  /**
   * Anexa la resolución a la decisión más reciente del contenido. `false` si
   * el contenido no tiene ninguna decisión registrada.
   */
  appendResolution(contentId: string, resolution: HumanModerationResolution): Promise<boolean>;
  /** Más antigua primero. */
  findByContentId(contentId: string): Promise<readonly AutomaticModerationRecord[]>;
}
