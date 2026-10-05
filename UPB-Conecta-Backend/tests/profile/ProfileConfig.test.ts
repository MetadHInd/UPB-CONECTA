import { describe, expect, it } from 'vitest';
import { InvalidProfileConfigError, readProfileConfig } from '../../src/contexts/profile/infrastructure/config/ProfileConfig.js';

describe('HU-37 — rango de semestre configurable sin recompilar', () => {
  it('usa 1..12 por defecto', () => {
    expect(readProfileConfig({}).semesterBounds).toEqual({ min: 1, max: 12 });
    expect(readProfileConfig({ PROFILE_SEMESTER_MAX: ' ' }).semesterBounds).toEqual({ min: 1, max: 12 });
  });

  it('lee el máximo desde PROFILE_SEMESTER_MAX', () => {
    expect(readProfileConfig({ PROFILE_SEMESTER_MAX: '10' }).semesterBounds).toEqual({ min: 1, max: 10 });
  });

  it.each(['0', '-2', '9.5', 'diez'])('rechaza un máximo inválido (%s)', (raw) => {
    expect(() => readProfileConfig({ PROFILE_SEMESTER_MAX: raw })).toThrow(InvalidProfileConfigError);
  });
});
