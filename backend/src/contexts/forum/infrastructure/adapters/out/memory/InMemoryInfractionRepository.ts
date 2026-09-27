import type { Infraction } from '../../../../domain/entities/Infraction.js';
import type { InfractionRepositoryPort } from '../../../../domain/ports/out/InfractionRepositoryPort.js';

export class InMemoryInfractionRepository implements InfractionRepositoryPort {
  private readonly infractions = new Map<string, Infraction>();

  async findById(id: string): Promise<Infraction | null> {
    return this.infractions.get(id) ?? null;
  }

  async create(infraction: Infraction): Promise<boolean> {
    if (this.infractions.has(infraction.id)) return false;
    this.infractions.set(infraction.id, infraction);
    return true;
  }

  async update(infraction: Infraction): Promise<void> {
    this.infractions.set(infraction.id, infraction);
  }

  async findByStudent(email: string): Promise<readonly Infraction[]> {
    return [...this.infractions.values()]
      .filter((infraction) => infraction.studentEmail === email)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  }
}
