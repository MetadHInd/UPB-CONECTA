import type { Sanction } from '../../../../domain/entities/Sanction.js';
import type { SanctionStatusPort } from '../../../../domain/ports/out/SanctionStatusPort.js';

/**
 * Doble configurable de la consulta de sanciones (HU-30 criterio 6). Sin
 * configurar, nadie tiene sanciones. `impose` existe solo para que las pruebas
 * preparen el caso: el mecanismo real de imposicion es otra historia.
 */
export class InMemorySanctionStatus implements SanctionStatusPort {
  private readonly sanctions = new Map<string, Sanction[]>();

  impose(email: string, sanction: Sanction): void {
    const key = email.trim().toLowerCase();
    this.sanctions.set(key, [...(this.sanctions.get(key) ?? []), sanction]);
  }

  async findSanctions(email: string): Promise<readonly Sanction[]> {
    return this.sanctions.get(email) ?? [];
  }
}
