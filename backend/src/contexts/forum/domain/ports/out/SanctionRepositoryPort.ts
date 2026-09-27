import type { SanctionRecord } from '../../entities/Sanction.js';
import type { SanctionStatusPort } from './SanctionStatusPort.js';

/**
 * Sanciones impuestas (HU-35). Extiende `SanctionStatusPort` (HU-30): el mismo
 * almacen que las guarda es el que `CreatePost` consulta para rechazar, asi
 * que una sancion impuesta aplica en la siguiente publicacion sin copiarla.
 */
export interface SanctionRepositoryPort extends SanctionStatusPort {
  save(sanction: SanctionRecord): Promise<void>;
  findById(id: string): Promise<SanctionRecord | null>;
  /** `email` ya normalizado. Mas reciente primero. */
  findSanctions(email: string): Promise<readonly SanctionRecord[]>;
  /** Reemplaza una existente (revocacion). */
  update(sanction: SanctionRecord): Promise<void>;
}
