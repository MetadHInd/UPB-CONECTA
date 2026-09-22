import { describe, expect, it } from 'vitest';
import { ProgramCatalogMatcher } from '../../src/contexts/targeting/domain/services/ProgramCatalogMatcher.js';
import type { InstitutionalProgramCatalog } from '../../src/contexts/targeting/domain/ports/out/ProgramCatalogPort.js';

const catalog: InstitutionalProgramCatalog = {
  faculties: [{ id: 'ingenieria', name: 'Facultad de Ingeniería', programIds: ['sistemas', 'industrial'] }],
  programs: [
    { id: 'sistemas', name: 'Ingeniería de Sistemas', facultyId: 'ingenieria' },
    { id: 'industrial', name: 'Ingeniería Industrial', facultyId: 'ingenieria' }
  ]
};

describe('Corrección bug 3 — ProgramCatalogMatcher traduce el programa del directorio al id del catálogo', () => {
  const matcher = new ProgramCatalogMatcher(catalog);

  it.each([
    ['Ingeniería de Sistemas', 'sistemas'],
    ['INGENIERIA DE SISTEMAS', 'sistemas'],
    ['  ingenieria   de sistemas ', 'sistemas'],
    ['sistemas', 'sistemas'],
    ['Ingeniería Industrial', 'industrial']
  ])('reconoce "%s" como %s (nombre o id, sin tildes, mayúsculas ni espacios extra)', (raw, id) => {
    expect(matcher.resolveProgramId(raw)).toBe(id);
  });

  it.each(['Astrofísica', '', '   ', 'Ingeniería', 'Facultad de Ingeniería'])('no reconoce "%s"', (raw) => {
    expect(matcher.resolveProgramId(raw)).toBeNull();
  });

  it('no adivina ante un catálogo ambiguo: dos programas con el mismo nombre normalizado', () => {
    const ambiguous = new ProgramCatalogMatcher({
      faculties: [],
      programs: [
        { id: 'sistemas-bog', name: 'Ingeniería de Sistemas', facultyId: 'f1' },
        { id: 'sistemas-med', name: 'Ingenieria de sistemas', facultyId: 'f2' }
      ]
    });

    expect(ambiguous.resolveProgramId('Ingeniería de Sistemas')).toBeNull();
    expect(ambiguous.resolveProgramId('sistemas-med')).toBe('sistemas-med');
  });
});
