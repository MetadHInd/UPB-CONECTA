import { describe, expect, it } from 'vitest';
import { matchesText, orderByDeadline, urgencyOf } from '../../src/contexts/feed/domain/services/FeedQuery.js';
import { QueryStudentFeed } from '../../src/contexts/feed/application/QueryStudentFeed.js';
import type { DueDate } from '../../src/contexts/ingestion/domain/value-objects/DueDate.js';

const NOW = new Date('2026-10-18T12:00:00Z');
const inHours = (hours: number): DueDate => ({ kind: 'con-fecha', date: new Date(NOW.getTime() + hours * 3_600_000) });
const NONE: DueDate = { kind: 'sin-vencimiento' };

function entry(id: string, dueDate: DueDate, lastSentAt: string, subject = id, body = '') {
  return {
    id,
    record: { subject, body, dueDate, lastSentAt: new Date(lastSentAt), representativeMessageId: `m-${id}` } as never
  };
}

describe('RF-19: nivel de urgencia', () => {
  it.each([
    [inHours(71), 'urgent'],
    [inHours(73), 'soon'],
    [inHours(24 * 7 - 1), 'soon'],
    [inHours(24 * 7 + 1), 'relaxed'],
    [NONE, 'relaxed'],
    [{ kind: 'ambigua', candidates: [], reason: 'x' } as DueDate, 'relaxed'],
    [inHours(-5), 'urgent']
  ] as const)('%j => %s', (due, level) => {
    expect(urgencyOf(due, NOW)).toBe(level);
  });
});

describe('RF-18: orden por proximidad del vencimiento', () => {
  it('plazos ascendentes y luego los demás por publicación descendente', () => {
    const ordered = orderByDeadline([
      entry('sin-viejo', NONE, '2026-10-01T00:00:00Z'),
      entry('lejos', inHours(200), '2026-10-10T00:00:00Z'),
      entry('sin-nuevo', NONE, '2026-10-15T00:00:00Z'),
      entry('cerca', inHours(10), '2026-10-02T00:00:00Z')
    ]);
    expect(ordered.map((e) => e.id)).toEqual(['cerca', 'lejos', 'sin-nuevo', 'sin-viejo']);
  });

  it('no muta la entrada', () => {
    const input = [entry('b', inHours(20), '2026-10-01T00:00:00Z'), entry('a', inHours(10), '2026-10-01T00:00:00Z')];
    orderByDeadline(input);
    expect(input.map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('RF-21: búsqueda por texto', () => {
  const record = { subject: 'Matrícula ordinaria 2026-20', body: 'Inscripción a Cursos de Idiomas' };
  it.each([
    ['matricula', true],
    ['MATRÍCULA idiomas', true],
    ['matricula posgrado', false],
    ['', true],
    ['   ', true]
  ])('"%s" => %s', (query, expected) => {
    expect(matchesText(record, query)).toBe(expected);
  });
});

describe('QueryStudentFeed (RF-17 a RF-21)', () => {
  const entries = [
    entry('a', inHours(100), '2026-10-01T00:00:00Z', 'Beca Fulbright', 'cierra pronto'),
    entry('b', inHours(10), '2026-10-02T00:00:00Z', 'Práctica en banco', ''),
    entry('c', NONE, '2026-10-05T00:00:00Z', 'Boletín de bienestar', '')
  ];
  const categoryOf: Record<string, string> = { 'm-a': 'beca', 'm-b': 'practica', 'm-c': 'boletin informativo' };
  const useCase = new QueryStudentFeed({
    feed: { execute: async () => ({ feed: entries, incompleteProfile: false }) },
    categories: {
      allowedCategories: () => ['beca', 'practica', 'boletin informativo'],
      categoriesFor: async (ids) => new Map(ids.map((id) => [id, categoryOf[id]!]))
    },
    clock: { now: () => NOW }
  });

  it('ordena, etiqueta urgencia y categoría', async () => {
    const result = await useCase.execute({ studentEmail: 'x@upb.edu.co' });
    if (!result.ok) throw new Error('debe ser ok');
    expect(result.feed.map((i) => [i.id, i.urgency, i.category])).toEqual([
      ['b', 'urgent', 'practica'],
      ['a', 'soon', 'beca'],
      ['c', 'relaxed', 'boletin informativo']
    ]);
  });

  it('filtra por varias categorías a la vez (RF-20)', async () => {
    const result = await useCase.execute({ studentEmail: 'x@upb.edu.co', categories: ['beca', 'practica'] });
    expect(result.ok && result.feed.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('busca en el texto (RF-21) y aplica el límite al final', async () => {
    const byText = await useCase.execute({ studentEmail: 'x@upb.edu.co', text: 'practica' });
    expect(byText.ok && byText.feed.map((i) => i.id)).toEqual(['b']);
    const limited = await useCase.execute({ studentEmail: 'x@upb.edu.co', limit: 2 });
    expect(limited.ok && limited.feed.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('rechaza una categoría desconocida', async () => {
    const result = await useCase.execute({ studentEmail: 'x@upb.edu.co', categories: ['inventada'] });
    expect(result).toMatchObject({ ok: false, error: 'invalid-category' });
  });
});
