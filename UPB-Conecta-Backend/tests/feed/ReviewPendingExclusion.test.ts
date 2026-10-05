import { describe, expect, it } from 'vitest';
import { GetSegmentedFeed } from '../../src/contexts/feed/application/GetSegmentedFeed.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { InMemoryProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';
import { InMemoryClassificationRetryQueue } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationRetryQueue.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { ClassificationResult } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';

class InMemoryConvocatoriaRepo {
  constructor(private readonly entries: any[]) {}
  async findSegmentedFeed() {
    return this.entries;
  }
}

describe('HU-10 — exclusion del feed de documentos en revision pendiente (gap 1)', () => {
  it('una convocatoria en revision pendiente no aparece en el feed; una publicada y una sin clasificar si', async () => {
    const classificationResultRepo = new InMemoryClassificationResultRepository();
    const convocatoria = ClassificationResult.fromCategory(MessageCategory.CONVOCATORIA_CON_PLAZO);
    await classificationResultRepo.save(convocatoria.toPersistedRecord('m-publicado', new Date(), 'published'));
    await classificationResultRepo.save(convocatoria.toPersistedRecord('m-pendiente', new Date(), 'pending-review'));

    const useCase = new GetSegmentedFeed({
      convocatoriaRepo: new InMemoryConvocatoriaRepo([
        { id: 'c-publicado', record: { representativeMessageId: 'm-publicado' } },
        { id: 'c-pendiente', record: { representativeMessageId: 'm-pendiente' } },
        { id: 'c-sin-clasificar', record: { representativeMessageId: 'm-sin-clasificar' } }
      ]) as any,
      programTargetingRepo: new InMemoryProgramTargetingRepository(),
      facultyResolver: new FacultyProgramResolver({ faculties: [], programs: [] } as any),
      classificationResultRepo,
      classificationRetryQueue: new InMemoryClassificationRetryQueue()
    });

    const result = await useCase.execute({ program: 'P1', semester: 3 });
    const ids = result.feed.map((entry) => entry.id);

    expect(ids).toContain('c-publicado');
    expect(ids).toContain('c-sin-clasificar');
    expect(ids).not.toContain('c-pendiente');
  });

  it('cuando el documento pasa de revision pendiente a publicado, vuelve a aparecer en el feed', async () => {
    const classificationResultRepo = new InMemoryClassificationResultRepository();
    const convocatoria = ClassificationResult.fromCategory(MessageCategory.CONVOCATORIA_CON_PLAZO);
    await classificationResultRepo.save(convocatoria.toPersistedRecord('m1', new Date(), 'pending-review'));

    const useCase = new GetSegmentedFeed({
      convocatoriaRepo: new InMemoryConvocatoriaRepo([{ id: 'c1', record: { representativeMessageId: 'm1' } }]) as any,
      programTargetingRepo: new InMemoryProgramTargetingRepository(),
      facultyResolver: new FacultyProgramResolver({ faculties: [], programs: [] } as any),
      classificationResultRepo,
      classificationRetryQueue: new InMemoryClassificationRetryQueue()
    });
    const profile = { name: 'Ana', email: 'a@x', program: 'P1', semester: 3 };

    expect((await useCase.execute(profile)).feed).toHaveLength(0);

    await classificationResultRepo.save(convocatoria.toPersistedRecord('m1', new Date(), 'published'));

    expect((await useCase.execute(profile)).feed.map((entry) => entry.id)).toEqual(['c1']);
  });
});
