import { allCommunityTargeting } from '../../targeting/domain/value-objects/ProgramTargeting.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { TopicRepositoryPort } from '../domain/ports/out/TopicRepositoryPort.js';

export interface TopicSeed {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export const SEED_AUTHOR = 'semilla-inicial';

/**
 * Siembra los temas iniciales (HU-30 criterio 3) solo si no existen: los
 * temas sembrados son datos de partida, no un enum. Volver a sembrar nunca
 * pisa lo que el administrador edito, restringio o retiro despues.
 */
export class SeedDefaultTopics {
  constructor(private readonly dependencies: { readonly topics: TopicRepositoryPort; readonly clock: ClockPort }) {}

  async execute(seeds: readonly TopicSeed[]): Promise<number> {
    const now = this.dependencies.clock.now();
    let created = 0;
    for (const seed of seeds) {
      const inserted = await this.dependencies.topics.create({
        ...seed,
        restriction: allCommunityTargeting(),
        status: 'active',
        createdAt: now,
        updatedAt: now,
        updatedBy: SEED_AUTHOR
      });
      if (inserted) created += 1;
    }
    return created;
  }
}
