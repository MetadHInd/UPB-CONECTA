import { describe, it, expect } from 'vitest';
import { NotificationPreferencesPolicy, InvalidLeadTimeError } from '../../../src/contexts/notifications/domain/services/NotificationPreferencesPolicy.js';
import { defaultPreferences } from '../../../src/contexts/notifications/domain/entities/NotificationPreferences.js';

const policy = new NotificationPreferencesPolicy();

describe('NotificationPreferencesPolicy', () => {
  it('criterio 1/2: una categoria nunca tocada esta activa por defecto (opt-out)', () => {
    const prefs = defaultPreferences('est-1', new Date('2026-01-01T00:00:00Z'));
    expect(policy.isCategoryEnabled(prefs, 'becas')).toBe(true);
  });

  it('criterio 2: una categoria desactivada explicitamente no notifica', () => {
    const prefs = { ...defaultPreferences('est-1', new Date()), categoryPreferences: { becas: false } };
    expect(policy.isCategoryEnabled(prefs, 'becas')).toBe(false);
    expect(policy.isCategoryEnabled(prefs, 'practicas')).toBe(true); // otra categoria no se ve afectada
  });

  it('criterio 5: acepta un valor de anticipacion admitido', () => {
    expect(() => policy.assertValidLeadTime(1440)).not.toThrow();
  });

  it('criterio 5: rechaza un valor de anticipacion fuera de catalogo', () => {
    expect(() => policy.assertValidLeadTime(45)).toThrow(InvalidLeadTimeError);
  });
});
