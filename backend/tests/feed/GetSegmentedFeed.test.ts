import { describe, expect, it } from 'vitest';
import { GetSegmentedFeed } from '../../src/contexts/feed/application/GetSegmentedFeed.js';
import { InMemoryProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';

// Simple in-memory convocatoria repo for tests
class InMemoryConvocatoriaRepo {
  constructor(private readonly entries: any[]) {}
  async findSegmentedFeed() {
    return this.entries;
  }
}

describe('GetSegmentedFeed', () => {
  it('shows program, faculty and all-community items to a student in a program', async () => {
    const catalog = {
      faculties: [{ id: 'F1', name: 'Fac1', programIds: ['P1', 'P2'] }],
      programs: [{ id: 'P1', name: 'Prog1', facultyId: 'F1' }]
    };

    const facultyResolver = new FacultyProgramResolver(catalog as any);
    const targetingRepo = new InMemoryProgramTargetingRepository();

    // rep message ids
    targetingRepo.save({ messageId: 'm-all', targeting: { kind: 'all-community' }, persistedAt: new Date() });
    targetingRepo.save({ messageId: 'm-fac', targeting: { kind: 'faculty', facultyId: 'F1' }, persistedAt: new Date() });
    targetingRepo.save({ messageId: 'm-prog', targeting: { kind: 'programs', programIds: ['P1'] }, persistedAt: new Date() });
    targetingRepo.save({ messageId: 'm-other', targeting: { kind: 'programs', programIds: ['P99'] }, persistedAt: new Date() });

    const convocatorias = [
      { id: 'c1', record: { representativeMessageId: 'm-all' } },
      { id: 'c2', record: { representativeMessageId: 'm-fac' } },
      { id: 'c3', record: { representativeMessageId: 'm-prog' } },
      { id: 'c4', record: { representativeMessageId: 'm-other' } }
    ];

    const repo = new InMemoryConvocatoriaRepo(convocatorias);
    const useCase = new GetSegmentedFeed({ convocatoriaRepo: repo as any, programTargetingRepo: targetingRepo as any, facultyResolver });

    const profile = { name: 'Ana', email: 'a@x', program: 'P1', semester: 3 };
    const res = await useCase.execute(profile as any);
    const ids = res.feed.map((e: any) => e.id);

    expect(ids).toContain('c1');
    expect(ids).toContain('c2');
    expect(ids).toContain('c3');
    expect(ids).not.toContain('c4');
    expect(res.incompleteProfile).toBe(false);
  });

  it('with missing program returns only all-community and flags incompleteProfile', async () => {
    const catalog = { faculties: [], programs: [] };
    const facultyResolver = new FacultyProgramResolver(catalog as any);
    const targetingRepo = new InMemoryProgramTargetingRepository();
    targetingRepo.save({ messageId: 'm-all', targeting: { kind: 'all-community' }, persistedAt: new Date() });

    const convocatorias = [{ id: 'c1', record: { representativeMessageId: 'm-all' } }, { id: 'c2', record: { representativeMessageId: 'm-prog' } }];
    const repo = new InMemoryConvocatoriaRepo(convocatorias);
    const useCase = new GetSegmentedFeed({ convocatoriaRepo: repo as any, programTargetingRepo: targetingRepo as any, facultyResolver });

    const profile = { name: 'Bob', email: 'b@x', program: undefined, semester: 0 };
    const res = await useCase.execute(profile as any);
    expect(res.feed.map((f: any) => f.id)).toContain('c1');
    expect(res.incompleteProfile).toBe(true);
  });

  it('program-targeted convocatoria is not shown to a student from a different program', async () => {
    const catalog = {
      faculties: [{ id: 'F1', name: 'Fac1', programIds: ['P1', 'P2'] }],
      programs: [{ id: 'P1', name: 'Prog1', facultyId: 'F1' }, { id: 'P2', name: 'Prog2', facultyId: 'F1' }]
    };

    const facultyResolver = new FacultyProgramResolver(catalog as any);
    const targetingRepo = new InMemoryProgramTargetingRepository();

    targetingRepo.save({ messageId: 'm-prog1', targeting: { kind: 'programs', programIds: ['P1'] }, persistedAt: new Date() });

    const convocatorias = [{ id: 'c-prog1', record: { representativeMessageId: 'm-prog1' } }];
    const repo = new InMemoryConvocatoriaRepo(convocatorias);
    const useCase = new GetSegmentedFeed({ convocatoriaRepo: repo as any, programTargetingRepo: targetingRepo as any, facultyResolver });

    const profile = { name: 'Carlos', email: 'c@x', program: 'P2', semester: 2 };
    const res = await useCase.execute(profile as any);
    expect(res.feed.map((f: any) => f.id)).not.toContain('c-prog1');
    expect(res.incompleteProfile).toBe(false);
  });

  it('faculty-targeted convocatoria is not shown to a student from a different faculty', async () => {
    const catalog = {
      faculties: [
        { id: 'F1', name: 'Fac1', programIds: ['P1'] },
        { id: 'F2', name: 'Fac2', programIds: ['P2'] }
      ],
      programs: [{ id: 'P1', name: 'Prog1', facultyId: 'F1' }, { id: 'P2', name: 'Prog2', facultyId: 'F2' }]
    };

    const facultyResolver = new FacultyProgramResolver(catalog as any);
    const targetingRepo = new InMemoryProgramTargetingRepository();

    targetingRepo.save({ messageId: 'm-fac1', targeting: { kind: 'faculty', facultyId: 'F1' }, persistedAt: new Date() });

    const convocatorias = [{ id: 'c-fac1', record: { representativeMessageId: 'm-fac1' } }];
    const repo = new InMemoryConvocatoriaRepo(convocatorias);
    const useCase = new GetSegmentedFeed({ convocatoriaRepo: repo as any, programTargetingRepo: targetingRepo as any, facultyResolver });

    const profile = { name: 'Diana', email: 'd@x', program: 'P2', semester: 1 };
    const res = await useCase.execute(profile as any);
    expect(res.feed.map((f: any) => f.id)).not.toContain('c-fac1');
    expect(res.incompleteProfile).toBe(false);
  });
});
