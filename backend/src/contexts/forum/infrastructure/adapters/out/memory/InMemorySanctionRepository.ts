import type { SanctionRecord } from '../../../../domain/entities/Sanction.js';
import type { SanctionRepositoryPort } from '../../../../domain/ports/out/SanctionRepositoryPort.js';

/** Sin sanciones guardadas, nadie esta sancionado: igual que en produccion. */
export class InMemorySanctionRepository implements SanctionRepositoryPort {
  private readonly sanctions = new Map<string, SanctionRecord>();

  async save(sanction: SanctionRecord): Promise<void> {
    this.sanctions.set(sanction.id, sanction);
  }

  async findById(id: string): Promise<SanctionRecord | null> {
    return this.sanctions.get(id) ?? null;
  }

  async findSanctions(email: string): Promise<readonly SanctionRecord[]> {
    return [...this.sanctions.values()]
      .filter((sanction) => sanction.studentEmail === email)
      .sort((a, b) => b.imposedAt.getTime() - a.imposedAt.getTime() || b.infractionCount - a.infractionCount);
  }

  async update(sanction: SanctionRecord): Promise<void> {
    this.sanctions.set(sanction.id, sanction);
  }
}
