import { describe, expect, it } from 'vitest';
import { FeedVisibilityPolicy } from '../../src/contexts/feed/domain/services/FeedVisibilityPolicy.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import {
  allCommunityTargeting,
  facultyTargeting,
  programTargeting
} from '../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import {
  InvalidSemesterRangeError,
  semesterRange,
  semesterRangeIncludes
} from '../../src/contexts/targeting/domain/value-objects/SemesterRange.js';
import { buildProfileHarness, CATALOG, DIRECTORY_PROFILE } from '../profile/profileHarness.js';

const EMAIL = DIRECTORY_PROFILE.email;

describe('HU-37 — SemesterRange (filtro de semestre ortogonal al programa)', () => {
  it('acepta rangos cerrados, abiertos hacia arriba y de un solo semestre', () => {
    expect(semesterRange(6)).toEqual({ min: 6, max: null });
    expect(semesterRange(1, 1)).toEqual({ min: 1, max: 1 });
    expect(semesterRange(3, 5)).toEqual({ min: 3, max: 5 });
  });

  it.each([
    [0, null],
    [1.5, null],
    [5, 4],
    [2, 2.5]
  ])('rechaza el rango inválido (%s, %s)', (min, max) => {
    expect(() => semesterRange(min, max)).toThrow(InvalidSemesterRangeError);
  });

  it('evalúa la pertenencia con límites inclusivos', () => {
    expect(semesterRangeIncludes(semesterRange(3, 5), 3)).toBe(true);
    expect(semesterRangeIncludes(semesterRange(3, 5), 5)).toBe(true);
    expect(semesterRangeIncludes(semesterRange(3, 5), 6)).toBe(false);
    expect(semesterRangeIncludes(semesterRange(6), 40)).toBe(true);
    expect(semesterRangeIncludes(semesterRange(6), 5)).toBe(false);
  });
});

describe('HU-37 — FeedVisibilityPolicy evalúa el semestre', () => {
  const policy = new FeedVisibilityPolicy(new FacultyProgramResolver(CATALOG));

  it('sin rango de semestre se comporta exactamente como antes', () => {
    expect(policy.isVisible(programTargeting(['sistemas']), { program: 'sistemas', semester: 1 })).toBe(true);
    expect(policy.isVisible(programTargeting(['sistemas']), { program: 'industrial', semester: 1 })).toBe(false);
  });

  it('cambiar solo el semestre cambia la visibilidad, con el programa fijo', () => {
    const range = semesterRange(6);

    expect(policy.isVisible(programTargeting(['sistemas']), { program: 'sistemas', semester: 5 }, range)).toBe(false);
    expect(policy.isVisible(programTargeting(['sistemas']), { program: 'sistemas', semester: 6 }, range)).toBe(true);
  });

  it('el semestre se combina con facultad y con toda la comunidad', () => {
    const firstSemester = semesterRange(1, 1);

    expect(policy.isVisible(facultyTargeting('ingenieria'), { program: 'industrial', semester: 1 }, firstSemester)).toBe(true);
    expect(policy.isVisible(facultyTargeting('ingenieria'), { program: 'industrial', semester: 2 }, firstSemester)).toBe(false);
    expect(policy.isVisible(allCommunityTargeting(), { semester: 1 }, firstSemester)).toBe(true);
    expect(policy.isVisible(allCommunityTargeting(), { semester: 3 }, firstSemester)).toBe(false);
  });

  it('el semestre no rescata un programa ajeno', () => {
    expect(policy.isVisible(programTargeting(['industrial']), { program: 'sistemas', semester: 6 }, semesterRange(6))).toBe(false);
  });

  it('un estudiante sin semestre conocido no ve contenido dirigido por semestre', () => {
    expect(policy.isVisible(allCommunityTargeting(), { program: 'sistemas' }, semesterRange(1))).toBe(false);
    expect(policy.isVisible(allCommunityTargeting(), { program: 'sistemas' })).toBe(true);
  });
});

describe('HU-37 criterios 3 y 4 — el semestre editado recalcula el feed', () => {
  it('subir el semestre muestra la convocatoria "6° en adelante" sin tocar el programa', async () => {
    const harness = buildProfileHarness();
    await harness.login();
    await harness.publish('electivas-6', { targeting: programTargeting(['sistemas']), semesterRange: semesterRange(6) });
    await harness.publish('general', { targeting: allCommunityTargeting() });

    expect(await harness.visibleFeedIds()).toEqual(['general']);

    await harness.update.execute({ email: EMAIL, changes: { semester: 6 } });

    expect(await harness.visibleFeedIds()).toEqual(['electivas-6', 'general']);
    expect((await harness.profiles.findByEmail(EMAIL))?.directory.program).toBe('sistemas');
  });

  it('bajar el semestre oculta la convocatoria dirigida al semestre anterior', async () => {
    const harness = buildProfileHarness();
    harness.changeDirectory({ semester: 1 });
    await harness.login();
    await harness.publish('induccion', { targeting: facultyTargeting('ingenieria'), semesterRange: semesterRange(1, 1) });

    expect(await harness.visibleFeedIds()).toEqual(['induccion']);

    await harness.update.execute({ email: EMAIL, changes: { semester: 2 } });

    expect(await harness.visibleFeedIds()).toEqual([]);
  });

  it('el feed usa el semestre editado aunque el directorio siga reportando el anterior tras un nuevo login', async () => {
    const harness = buildProfileHarness();
    await harness.login();
    await harness.publish('electivas-6', { targeting: programTargeting(['sistemas']), semesterRange: semesterRange(6) });
    await harness.update.execute({ email: EMAIL, changes: { semester: 6 } });

    await harness.login(); // el directorio sigue diciendo semestre 5

    expect(await harness.visibleFeedIds()).toEqual(['electivas-6']);
  });

  it('un estudiante sin perfil sincronizado solo ve contenido para toda la comunidad y se marca incompleto', async () => {
    const harness = buildProfileHarness();
    await harness.publish('general', { targeting: allCommunityTargeting() });
    await harness.publish('sistemas', { targeting: programTargeting(['sistemas']) });

    const result = await harness.feed.execute('nadie@upb.edu.co');

    expect(result.feed.map((entry) => entry.id)).toEqual(['general']);
    expect(result.incompleteProfile).toBe(true);
  });
});
