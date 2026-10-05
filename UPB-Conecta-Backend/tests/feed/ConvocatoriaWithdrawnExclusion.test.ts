import { describe, expect, it } from 'vitest';
import { GetSegmentedFeed } from '../../src/contexts/feed/application/GetSegmentedFeed.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { InMemoryProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';

class InMemoryConvocatoriaRepo {
  constructor(private readonly entries: any[]) {}
  async findSegmentedFeed() {
    return this.entries;
  }
}

function buildUseCase(entries: any[]) {
  return new GetSegmentedFeed({
    convocatoriaRepo: new InMemoryConvocatoriaRepo(entries) as any,
    programTargetingRepo: new InMemoryProgramTargetingRepository(),
    facultyResolver: new FacultyProgramResolver({ faculties: [], programs: [] } as any)
  });
}

const PROFILE = { name: 'Ana', email: 'a@x', program: 'P1', semester: 3 };

describe('HU-50, criterio 3 — una convocatoria retirada deja de ser visible en el feed', () => {
  it('excluye una convocatoria con withdrawnAt marcado', async () => {
    const useCase = buildUseCase([
      { id: 'c-vigente', record: { representativeMessageId: 'm-vigente', withdrawnAt: null } },
      { id: 'c-retirada', record: { representativeMessageId: 'm-retirada', withdrawnAt: new Date('2026-09-23T00:00:00Z') } }
    ]);

    const ids = (await useCase.execute(PROFILE)).feed.map((entry) => entry.id);

    expect(ids).toContain('c-vigente');
    expect(ids).not.toContain('c-retirada');
  });

  it('una convocatoria sin el campo withdrawnAt (historico previo a HU-50) sigue visible', async () => {
    const useCase = buildUseCase([{ id: 'c-historico', record: { representativeMessageId: 'm-historico' } }]);

    const ids = (await useCase.execute(PROFILE)).feed.map((entry) => entry.id);

    expect(ids).toContain('c-historico');
  });
});
