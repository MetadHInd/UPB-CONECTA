import { describe, expect, it } from 'vitest';
import type { ForumAuthor } from '../../src/contexts/forum/domain/entities/ForumAuthor.js';
import type { Sanction } from '../../src/contexts/forum/domain/entities/Sanction.js';
import type { Topic } from '../../src/contexts/forum/domain/entities/Topic.js';
import { ForumAccessPolicy } from '../../src/contexts/forum/domain/services/ForumAccessPolicy.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import {
  allCommunityTargeting,
  facultyTargeting,
  programTargeting,
  type ProgramTargeting
} from '../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';

const NOW = new Date('2026-09-22T12:00:00Z');
const CATALOG = {
  faculties: [
    { id: 'ingenieria', name: 'Facultad de Ingeniería', programIds: ['sistemas', 'industrial'] },
    { id: 'humanidades', name: 'Facultad de Humanidades', programIds: ['psicologia'] }
  ],
  programs: [
    { id: 'sistemas', name: 'Ingeniería de Sistemas', facultyId: 'ingenieria' },
    { id: 'industrial', name: 'Ingeniería Industrial', facultyId: 'ingenieria' },
    { id: 'psicologia', name: 'Psicología', facultyId: 'humanidades' }
  ]
};
const policy = new ForumAccessPolicy(new FacultyProgramResolver(CATALOG));

const author = (overrides: Partial<ForumAuthor> = {}): ForumAuthor => ({
  email: 'ana@upb.edu.co',
  name: 'Ana Gómez',
  programName: 'Ingeniería de Sistemas',
  programId: 'sistemas',
  syncedAt: NOW,
  ...overrides
});

const topic = (restriction: ProgramTargeting = allCommunityTargeting(), overrides: Partial<Topic> = {}): Topic => ({
  id: 'academico',
  name: 'Académico',
  description: 'Dudas académicas',
  restriction,
  status: 'active',
  createdAt: NOW,
  updatedAt: NOW,
  updatedBy: 'admin@upb.edu.co',
  ...overrides
});

const sanction = (startsAt: string, endsAt: string): Sanction => ({ startsAt: new Date(startsAt), endsAt: new Date(endsAt) });

describe('HU-30 — ForumAccessPolicy (servicio de dominio puro)', () => {
  describe('acceso a un tema (criterio 4)', () => {
    it('un tema sin restricción es accesible para cualquier autor verificado', () => {
      expect(policy.checkTopicAccess(topic(), author())).toEqual({ allowed: true });
    });

    it.each([
      ['programa listado', programTargeting(['sistemas', 'industrial']), 'sistemas', true],
      ['programa no listado', programTargeting(['psicologia']), 'sistemas', false],
      ['facultad propia', facultyTargeting('ingenieria'), 'industrial', true],
      ['facultad ajena', facultyTargeting('humanidades'), 'sistemas', false]
    ])('restricción por %s', (_label, restriction, programId, allowed) => {
      const decision = policy.checkTopicAccess(topic(restriction), author({ programId }));
      expect(decision.allowed).toBe(allowed);
      if (!allowed) expect(decision).toEqual({ allowed: false, reason: 'topic-restricted' });
    });

    it('un autor sin programa reconocido en el catálogo no entra a temas restringidos', () => {
      expect(policy.checkTopicAccess(topic(programTargeting(['sistemas'])), author({ programId: null }))).toEqual({
        allowed: false,
        reason: 'topic-restricted'
      });
      expect(policy.checkTopicAccess(topic(facultyTargeting('ingenieria')), author({ programId: null }))).toEqual({
        allowed: false,
        reason: 'topic-restricted'
      });
      expect(policy.checkTopicAccess(topic(), author({ programId: null }))).toEqual({ allowed: true });
    });

    it('un tema retirado o inexistente no es accesible', () => {
      expect(policy.checkTopicAccess(topic(allCommunityTargeting(), { status: 'retired' }), author())).toEqual({
        allowed: false,
        reason: 'topic-not-found'
      });
      expect(policy.checkTopicAccess(null, author())).toEqual({ allowed: false, reason: 'topic-not-found' });
    });
  });

  describe('publicar (criterios 2, 4 y 6 combinados)', () => {
    it('autor verificado, tema accesible y sin sanción: procede', () => {
      expect(policy.decidePublication({ author: author(), topic: topic(), sanctions: [], now: NOW })).toEqual({ allowed: true });
    });

    it.each([
      ['sin autor verificado', null],
      ['nombre vacío', author({ name: '' })],
      ['nombre solo con espacios', author({ name: '   ' })]
    ])('rechaza la publicación anónima: %s', (_label, candidate) => {
      expect(policy.decidePublication({ author: candidate, topic: topic(), sanctions: [], now: NOW })).toEqual({
        allowed: false,
        reason: 'author-not-verified'
      });
    });

    it('una sanción vigente rechaza e informa la fecha de fin', () => {
      const decision = policy.decidePublication({
        author: author(),
        topic: topic(),
        sanctions: [sanction('2026-09-20T00:00:00Z', '2026-09-30T05:00:00Z')],
        now: NOW
      });

      expect(decision).toEqual({ allowed: false, reason: 'sanctioned', sanctionEndsAt: new Date('2026-09-30T05:00:00Z') });
    });

    it('con varias sanciones vigentes informa la que termina más tarde', () => {
      const decision = policy.decidePublication({
        author: author(),
        topic: topic(),
        sanctions: [sanction('2026-09-20T00:00:00Z', '2026-09-25T00:00:00Z'), sanction('2026-09-21T00:00:00Z', '2026-10-15T00:00:00Z')],
        now: NOW
      });

      expect(decision).toMatchObject({ reason: 'sanctioned', sanctionEndsAt: new Date('2026-10-15T00:00:00Z') });
    });

    it.each([
      ['ya terminada', '2026-09-01T00:00:00Z', '2026-09-22T12:00:00Z'],
      ['todavía no empieza', '2026-09-23T00:00:00Z', '2026-09-30T00:00:00Z']
    ])('una sanción %s no impide publicar', (_label, startsAt, endsAt) => {
      expect(
        policy.decidePublication({ author: author(), topic: topic(), sanctions: [sanction(startsAt, endsAt)], now: NOW })
      ).toEqual({ allowed: true });
    });

    it('la restricción del tema se evalúa antes que la sanción, para que el intento quede registrado', () => {
      const decision = policy.decidePublication({
        author: author({ programId: 'psicologia' }),
        topic: topic(programTargeting(['sistemas'])),
        sanctions: [sanction('2026-09-20T00:00:00Z', '2026-09-30T00:00:00Z')],
        now: NOW
      });

      expect(decision).toEqual({ allowed: false, reason: 'topic-restricted' });
    });

    it('un autor no verificado se rechaza antes de mirar el tema', () => {
      expect(policy.decidePublication({ author: null, topic: null, sanctions: [], now: NOW })).toEqual({
        allowed: false,
        reason: 'author-not-verified'
      });
    });
  });
});
