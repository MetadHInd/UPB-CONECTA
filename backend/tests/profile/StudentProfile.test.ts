import { describe, expect, it } from 'vitest';
import {
  classifyProfileChanges,
  StudentProfile,
  type DirectoryRecord
} from '../../src/contexts/profile/domain/entities/StudentProfile.js';
import {
  createSemesterBounds,
  InvalidSemesterBoundsError,
  SemesterNumber,
  SemesterOutOfRangeError
} from '../../src/contexts/profile/domain/value-objects/SemesterNumber.js';

const BOUNDS = createSemesterBounds(12);
const T0 = new Date('2026-09-22T12:00:00Z');
const T1 = new Date('2026-09-23T12:00:00Z');

const directory = (overrides: Partial<DirectoryRecord> = {}): DirectoryRecord => ({
  name: 'Ana Gómez',
  email: 'Estudiante@UPB.edu.co',
  program: 'sistemas',
  semester: 5,
  ...overrides
});

describe('HU-37 — SemesterNumber (criterio 5)', () => {
  it.each([1, 6, 12])('acepta %i dentro del rango 1..12', (value) => {
    expect(SemesterNumber.create(value, BOUNDS).value).toBe(value);
  });

  it.each([0, 13, -1, 2.5, '5', null, undefined, Number.NaN])('rechaza %s indicando el rango válido', (value) => {
    expect(() => SemesterNumber.create(value, BOUNDS)).toThrow(SemesterOutOfRangeError);
    expect(() => SemesterNumber.create(value, BOUNDS)).toThrow('El semestre debe ser un número entero entre 1 y 12.');
  });

  it('el error expone el rango para que el servidor lo devuelva', () => {
    try {
      SemesterNumber.create(20, BOUNDS);
      throw new Error('debía fallar');
    } catch (error) {
      expect(error).toBeInstanceOf(SemesterOutOfRangeError);
      expect((error as SemesterOutOfRangeError).bounds).toEqual({ min: 1, max: 12 });
    }
  });

  it('el máximo es configurable y el mínimo siempre es 1', () => {
    expect(createSemesterBounds(10)).toEqual({ min: 1, max: 10 });
    expect(() => SemesterNumber.create(11, createSemesterBounds(10))).toThrow('entre 1 y 10');
  });

  it.each([0, -3, 1.5])('rechaza un máximo inválido (%s)', (max) => {
    expect(() => createSemesterBounds(max)).toThrow(InvalidSemesterBoundsError);
  });
});

describe('HU-37 — StudentProfile: frontera solo lectura / editable (criterio 2)', () => {
  it('la proyección del directorio y el semestre no se pueden reasignar (comprobado por tsc)', () => {
    const profile = StudentProfile.fromDirectory(directory(), 'sistemas', BOUNDS, T0);

    // Cada línea siguiente DEBE ser un error de compilación. Si alguien quita
    // un `readonly`, `@ts-expect-error` deja de tener error que esperar y
    // `npm run typecheck` falla: la frontera se verifica en tiempo de compilación.
    const attempts = () => {
      // @ts-expect-error `programId` proviene del directorio: solo lectura.
      profile.directory.programId = 'medicina';
      // @ts-expect-error `email` proviene del directorio: solo lectura.
      profile.directory.email = 'otro@upb.edu.co';
      // @ts-expect-error la proyección completa tampoco se reemplaza.
      profile.directory = { email: 'x', programId: 'y' };
      // @ts-expect-error el semestre solo cambia con `withSemester`, nunca asignándolo.
      profile.semester = SemesterNumber.create(9, BOUNDS);
    };
    expect(attempts).toBeTypeOf('function');
  });

  it('en tiempo de ejecución la entidad también está congelada', () => {
    const profile = StudentProfile.fromDirectory(directory(), 'sistemas', BOUNDS, T0);

    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.directory)).toBe(true);
  });

  it('withSemester es la única vía de cambio y devuelve un perfil nuevo con origen "student"', () => {
    const original = StudentProfile.fromDirectory(directory(), 'sistemas', BOUNDS, T0);

    const edited = original.withSemester(SemesterNumber.create(7, BOUNDS), T1);

    expect(edited.semester?.value).toBe(7);
    expect(edited.semesterSource).toBe('student');
    expect(edited.updatedAt).toEqual(T1);
    expect(edited.directory).toEqual(original.directory);
    expect(original.semester?.value).toBe(5);
  });

  it('clasifica los cambios pedidos: campos del directorio, editables y desconocidos', () => {
    expect(classifyProfileChanges({ semester: 6 })).toEqual({ readOnly: [], unknown: [], semester: { present: true, value: 6 } });
    expect(classifyProfileChanges({ program: 'medicina', programId: 'medicina', name: 'X', semester: 6, color: 'azul' })).toEqual({
      readOnly: ['program', 'programId', 'name'],
      unknown: ['color'],
      semester: { present: true, value: 6 }
    });
    expect(classifyProfileChanges({})).toEqual({ readOnly: [], unknown: [], semester: { present: false } });
  });
});

describe('HU-37 — sincronización con el directorio', () => {
  it('el primer perfil toma programa y semestre del directorio y normaliza el correo', () => {
    const profile = StudentProfile.fromDirectory(directory(), 'sistemas', BOUNDS, T0);

    expect(profile.directory).toEqual({ email: 'estudiante@upb.edu.co', programId: 'sistemas' });
    expect(profile.semester?.value).toBe(5);
    expect(profile.semesterSource).toBe('directory');
    expect(profile.version).toBe(0);
  });

  it('actualiza los campos del directorio y conserva el semestre editado por el estudiante', () => {
    const edited = StudentProfile.fromDirectory(directory(), 'sistemas', BOUNDS, T0).withSemester(SemesterNumber.create(8, BOUNDS), T0);

    const synced = edited.syncedWith(directory({ program: 'industrial', semester: 5 }), 'industrial', BOUNDS, T1);

    expect(synced.directory.programId).toBe('industrial');
    expect(synced.semester?.value).toBe(8);
    expect(synced.semesterSource).toBe('student');
    expect(synced.updatedAt).toEqual(T1);
  });

  it('si el estudiante nunca editó, el semestre sigue al directorio', () => {
    const fromDirectory = StudentProfile.fromDirectory(directory({ semester: 5 }), 'sistemas', BOUNDS, T0);

    const synced = fromDirectory.syncedWith(directory({ semester: 6 }), 'sistemas', BOUNDS, T1);

    expect(synced.semester?.value).toBe(6);
    expect(synced.semesterSource).toBe('directory');
  });

  it('un semestre del directorio fuera de rango no rompe el login: queda desconocido', () => {
    const profile = StudentProfile.fromDirectory(directory({ semester: 0 }), 'sistemas', BOUNDS, T0);

    expect(profile.semester).toBeNull();
    expect(profile.segment()).toEqual({ program: 'sistemas' });
  });

  it('sin programa reconocido el segmento no lleva programa', () => {
    const profile = StudentProfile.fromDirectory(directory({ program: 'Astrofísica' }), null, BOUNDS, T0);

    expect(profile.directory.programId).toBeNull();
    expect(profile.segment()).toEqual({ semester: 5 });
  });

  it('segment() expone solo programa y semestre efectivo', () => {
    const profile = StudentProfile.fromDirectory(directory(), 'sistemas', BOUNDS, T0).withSemester(SemesterNumber.create(9, BOUNDS), T1);

    expect(profile.segment()).toEqual({ program: 'sistemas', semester: 9 });
  });
});

describe('HU-37 — minimización de datos (criterio 6)', () => {
  it('el perfil no retiene el nombre ni ningún otro dato del directorio que no segmente', () => {
    const record = { ...directory(), studentId: '2024-0001', phone: '300 000 0000' } as DirectoryRecord;

    const profile = StudentProfile.fromDirectory(record, 'sistemas', BOUNDS, T0);

    expect(Object.keys(profile.directory).sort()).toEqual(['email', 'programId']);
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toContain('Ana Gómez');
    expect(serialized).not.toContain('2024-0001');
    expect(serialized).not.toContain('300 000 0000');
  });
});
