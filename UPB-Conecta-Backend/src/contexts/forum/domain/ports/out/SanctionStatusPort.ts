import type { Sanction } from '../../entities/Sanction.js';

/**
 * Consulta de sanciones del estudiante (HU-30 criterio 6). Imponerlas es otra
 * historia (moderacion); este puerto solo lee. La decision de si una sancion
 * esta vigente la toma el dominio (`isSanctionActive`), no el adaptador.
 */
export interface SanctionStatusPort {
  findSanctions(email: string): Promise<readonly Sanction[]>;
}
