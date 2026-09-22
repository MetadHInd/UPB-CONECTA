import { describe, expect, it } from 'vitest';
import { allCommunityTargeting, programTargeting } from '../../src/contexts/targeting/domain/value-objects/ProgramTargeting.js';
import { buildProfileHarness, DIRECTORY_PROFILE } from './profileHarness.js';

const EMAIL = DIRECTORY_PROFILE.email;

describe('Corrección bug 3 — el perfil guarda el id del catálogo, no el nombre del directorio', () => {
  it('un directorio que entrega el nombre del programa queda sincronizado con su id', async () => {
    const harness = buildProfileHarness();
    harness.changeDirectory({ program: 'Ingeniería de Sistemas' });

    await harness.login();

    expect((await harness.profiles.findByEmail(EMAIL))?.directory.programId).toBe('sistemas');
  });

  it('con el nombre traducido, la convocatoria dirigida al programa es visible', async () => {
    const harness = buildProfileHarness();
    harness.changeDirectory({ program: 'Ingeniería de Sistemas' });
    await harness.login();
    await harness.publish('sistemas', { targeting: programTargeting(['sistemas']) });

    expect(await harness.visibleFeedIds()).toEqual(['sistemas']);
  });

  describe('programa no reconocido en el catálogo', () => {
    it('se guarda sin programa y el feed muestra solo toda la comunidad, marcado como incompleto', async () => {
      const harness = buildProfileHarness();
      harness.changeDirectory({ program: 'Astrofísica' });
      await harness.login();
      await harness.publish('general', { targeting: allCommunityTargeting() });
      await harness.publish('sistemas', { targeting: programTargeting(['sistemas']) });

      const stored = await harness.profiles.findByEmail(EMAIL);
      const result = await harness.feed.execute(EMAIL);

      expect(stored?.directory.programId).toBeNull();
      expect(result.feed.map((entry) => entry.id)).toEqual(['general']);
      expect(result.incompleteProfile).toBe(true);
    });

    it('el login no falla y la vista lo informa sin ocultar el nombre del directorio', async () => {
      const harness = buildProfileHarness();
      harness.changeDirectory({ program: 'Astrofísica' });
      const login = await harness.login();

      const view = await harness.view.execute(login.profile);

      expect(view.readOnly.program).toBe('Astrofísica');
      expect(view.readOnly.programRecognized).toBe(false);
    });

    it('conserva el semestre: la falta de programa no borra lo que el estudiante editó', async () => {
      const harness = buildProfileHarness();
      await harness.login();
      await harness.update.execute({ email: EMAIL, changes: { semester: 8 } });

      harness.changeDirectory({ program: 'Astrofísica' });
      await harness.login();

      const stored = await harness.profiles.findByEmail(EMAIL);
      expect(stored?.directory.programId).toBeNull();
      expect(stored?.semester?.value).toBe(8);
    });

    it('si el catálogo luego incluye el programa, el siguiente login lo reconoce', async () => {
      const harness = buildProfileHarness();
      harness.changeDirectory({ program: 'Ingeniería Industrial' });
      harness.catalog.programs = harness.catalog.programs.filter((program) => program.id !== 'industrial');
      await harness.login();
      expect((await harness.profiles.findByEmail(EMAIL))?.directory.programId).toBeNull();

      harness.catalog.programs = [...harness.catalog.programs, { id: 'industrial', name: 'Ingeniería Industrial', facultyId: 'ingenieria' }];
      await harness.login();

      expect((await harness.profiles.findByEmail(EMAIL))?.directory.programId).toBe('industrial');
    });
  });

  it('la vista marca como reconocido un programa del catálogo', async () => {
    const harness = buildProfileHarness();
    const login = await harness.login();

    expect((await harness.view.execute(login.profile)).readOnly.programRecognized).toBe(true);
  });
});
