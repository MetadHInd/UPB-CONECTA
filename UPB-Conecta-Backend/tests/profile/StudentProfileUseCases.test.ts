import { describe, expect, it, vi } from 'vitest';
import { ProfileUpdateFailureKind } from '../../src/contexts/profile/application/UpdateStudentProfile.js';
import { DIRECTORY_CORRECTION_NOTICE } from '../../src/contexts/profile/domain/entities/StudentProfile.js';
import { InMemoryStudentProfileRepository } from '../../src/contexts/profile/infrastructure/adapters/out/memory/InMemoryStudentProfileRepository.js';
import { buildProfileHarness, DIRECTORY_PROFILE } from './profileHarness.js';

const EMAIL = DIRECTORY_PROFILE.email;

describe('HU-37 — perfil del estudiante y semestre editable (RF-59, RF-60, RNF-15, RNF-20)', () => {
  describe('sincronización con el directorio en cada autenticación', () => {
    it('el login persiste el perfil con programa y semestre del directorio', async () => {
      const harness = buildProfileHarness();

      await harness.login();

      const stored = await harness.profiles.findByEmail(EMAIL);
      expect(stored?.directory).toEqual({ email: EMAIL, programId: 'sistemas' });
      expect(stored?.semester?.value).toBe(5);
      expect(stored?.semesterSource).toBe('directory');
    });

    it('un login posterior actualiza el programa del directorio sin tocar el semestre editado', async () => {
      const harness = buildProfileHarness();
      await harness.login();
      await harness.update.execute({ email: EMAIL, changes: { semester: 8 } });

      harness.changeDirectory({ program: 'industrial', semester: 5 });
      await harness.login();

      const stored = await harness.profiles.findByEmail(EMAIL);
      expect(stored?.directory.programId).toBe('industrial');
      expect(stored?.semester?.value).toBe(8);
      expect(stored?.semesterSource).toBe('student');
    });

    it('si el perfil no se puede sincronizar, el login falla y no se abre sesión', async () => {
      const profiles = new InMemoryStudentProfileRepository();
      profiles.findByEmail = async () => {
        throw new Error('Mongo no disponible');
      };
      const harness = buildProfileHarness({ profiles });
      const startSession = vi.spyOn(harness.identity.sessions, 'startSession');

      await expect(harness.login()).rejects.toThrow('Mongo no disponible');
      expect(startSession).not.toHaveBeenCalled();
    });

    it('un intento de login fallido no sincroniza nada', async () => {
      const harness = buildProfileHarness();

      await harness.identity.authenticate.execute({ username: EMAIL, password: 'mala', origin: '10.0.0.1' });

      expect(await harness.profiles.findByEmail(EMAIL)).toBeNull();
    });
  });

  describe('criterio 1 — ver nombre, correo, programa y semestre del directorio', () => {
    it('la vista combina los datos frescos del directorio con el semestre vigente', async () => {
      const harness = buildProfileHarness();
      const login = await harness.login();

      const view = await harness.view.execute(login.profile);

      expect(view.readOnly).toEqual({
        name: 'Ana Gómez',
        email: EMAIL,
        program: 'sistemas',
        programRecognized: true,
        directorySemester: 5,
        correctionNotice: DIRECTORY_CORRECTION_NOTICE
      });
      expect(view.editable).toEqual({ semester: 5, semesterSource: 'directory', allowedRange: { min: 1, max: 12 } });
    });

    it('tras editar, la vista muestra el semestre del estudiante sin ocultar el del directorio', async () => {
      const harness = buildProfileHarness();
      const login = await harness.login();
      await harness.update.execute({ email: EMAIL, changes: { semester: 6 } });

      const view = await harness.view.execute(login.profile);

      expect(view.readOnly.directorySemester).toBe(5);
      expect(view.editable.semester).toBe(6);
      expect(view.editable.semesterSource).toBe('student');
    });

    it('si el directorio reporta un semestre fuera de rango, la vista lo muestra y deja el editable vacío', async () => {
      const harness = buildProfileHarness();
      harness.changeDirectory({ semester: 0 });
      const login = await harness.login();

      const view = await harness.view.execute(login.profile);

      expect(view.readOnly.directorySemester).toBe(0);
      expect(view.editable.semester).toBeNull();
    });

    it('sin perfil persistido todavía, la vista se arma solo con el directorio', async () => {
      const harness = buildProfileHarness();

      const view = await harness.view.execute(DIRECTORY_PROFILE);

      expect(view.editable).toMatchObject({ semester: 5, semesterSource: 'directory' });
    });
  });

  describe('criterio 2 — los datos del directorio son de solo lectura', () => {
    it('el servidor rechaza cambiar un campo del directorio e indica que se tramita ante la Universidad', async () => {
      const harness = buildProfileHarness();
      await harness.login();

      const result = await harness.update.execute({ email: EMAIL, changes: { program: 'medicina', name: 'Otra' } });

      expect(result).toEqual({
        ok: false,
        error: ProfileUpdateFailureKind.READ_ONLY_FIELD,
        message: DIRECTORY_CORRECTION_NOTICE,
        fields: ['program', 'name']
      });
      expect((await harness.profiles.findByEmail(EMAIL))?.directory.programId).toBe('sistemas');
    });

    it('rechaza la petición completa si mezcla un campo editable con uno de solo lectura', async () => {
      const harness = buildProfileHarness();
      await harness.login();

      const result = await harness.update.execute({ email: EMAIL, changes: { semester: 7, email: 'otro@upb.edu.co' } });

      expect(result).toMatchObject({ ok: false, error: ProfileUpdateFailureKind.READ_ONLY_FIELD });
      expect((await harness.profiles.findByEmail(EMAIL))?.semester?.value).toBe(5);
    });

    it('rechaza campos que el perfil no conoce', async () => {
      const harness = buildProfileHarness();
      await harness.login();

      const result = await harness.update.execute({ email: EMAIL, changes: { semester: 6, color: 'azul' } });

      expect(result).toMatchObject({ ok: false, error: ProfileUpdateFailureKind.UNKNOWN_FIELD, fields: ['color'] });
    });

    it('rechaza una petición sin cambios', async () => {
      const harness = buildProfileHarness();
      await harness.login();

      const result = await harness.update.execute({ email: EMAIL, changes: {} });

      expect(result).toMatchObject({ ok: false, error: ProfileUpdateFailureKind.NO_CHANGES });
    });
  });

  describe('criterio 3 — el semestre editado se persiste', () => {
    it('guarda el semestre con origen "student" y devuelve la parte editable', async () => {
      const harness = buildProfileHarness();
      await harness.login();
      harness.advanceDays(1);

      const result = await harness.update.execute({ email: EMAIL, changes: { semester: 6 } });

      expect(result).toEqual({
        ok: true,
        editable: { semester: 6, semesterSource: 'student', allowedRange: { min: 1, max: 12 } }
      });
      const stored = await harness.profiles.findByEmail(EMAIL);
      expect(stored).toMatchObject({ semesterSource: 'student', updatedAt: harness.now() });
      expect(stored?.semester?.value).toBe(6);
    });

    it('normaliza el correo: la sesión puede traerlo con otras mayúsculas', async () => {
      const harness = buildProfileHarness();
      await harness.login();

      const result = await harness.update.execute({ email: '  Estudiante@UPB.edu.co ', changes: { semester: 6 } });

      expect(result.ok).toBe(true);
    });

    it('sin perfil sincronizado no hay nada que editar', async () => {
      const harness = buildProfileHarness();

      const result = await harness.update.execute({ email: EMAIL, changes: { semester: 6 } });

      expect(result).toMatchObject({ ok: false, error: ProfileUpdateFailureKind.PROFILE_NOT_FOUND });
    });
  });

  describe('criterio 5 — semestre fuera de rango', () => {
    it.each([0, 13, 4.5, '6', null])('rechaza %s indicando el rango válido y no persiste nada', async (semester) => {
      const harness = buildProfileHarness();
      await harness.login();

      const result = await harness.update.execute({ email: EMAIL, changes: { semester } });

      expect(result).toEqual({
        ok: false,
        error: ProfileUpdateFailureKind.SEMESTER_OUT_OF_RANGE,
        message: 'El semestre debe ser un número entero entre 1 y 12.',
        allowedRange: { min: 1, max: 12 }
      });
      expect((await harness.profiles.findByEmail(EMAIL))?.semester?.value).toBe(5);
    });

    it('el rango sigue la configuración recibida', async () => {
      const harness = buildProfileHarness({ maxSemester: 10 });
      await harness.login();

      const result = await harness.update.execute({ email: EMAIL, changes: { semester: 11 } });

      expect(result).toMatchObject({ ok: false, allowedRange: { min: 1, max: 10 } });
    });
  });

  describe('concurrencia optimista', () => {
    it('una escritura con versión desactualizada se rechaza en el repositorio', async () => {
      const harness = buildProfileHarness();
      await harness.login();
      const stale = await harness.profiles.findByEmail(EMAIL);
      await harness.update.execute({ email: EMAIL, changes: { semester: 9 } });

      const saved = await harness.profiles.save(stale!.syncedWith(DIRECTORY_PROFILE, 'sistemas', harness.bounds, harness.now()));

      expect(saved).toBe(false);
      expect((await harness.profiles.findByEmail(EMAIL))?.semester?.value).toBe(9);
    });

    it('una sincronización que choca con una edición reintenta y conserva el semestre editado', async () => {
      const profiles = new InMemoryStudentProfileRepository();
      const harness = buildProfileHarness({ profiles });
      await harness.login();
      // La primera lectura de la sincronización ve el perfil antes de la edición.
      let interleaved = false;
      const originalFind = profiles.findByEmail.bind(profiles);
      profiles.findByEmail = async (email) => {
        const snapshot = await originalFind(email);
        if (!interleaved) {
          interleaved = true;
          await harness.update.execute({ email, changes: { semester: 10 } });
        }
        return snapshot;
      };

      await harness.sync.execute(DIRECTORY_PROFILE);

      const stored = await originalFind(EMAIL);
      expect(stored?.semester?.value).toBe(10);
      expect(stored?.semesterSource).toBe('student');
    });

    it('si el conflicto persiste, la sincronización falla en lugar de sobrescribir', async () => {
      const profiles = new InMemoryStudentProfileRepository();
      const harness = buildProfileHarness({ profiles });
      await harness.login();
      profiles.save = async () => false;

      await expect(harness.sync.execute(DIRECTORY_PROFILE)).rejects.toThrow(/concurrente/);
      await expect(harness.update.execute({ email: EMAIL, changes: { semester: 6 } })).resolves.toMatchObject({
        ok: false,
        error: ProfileUpdateFailureKind.CONCURRENT_MODIFICATION
      });
    });
  });
});
