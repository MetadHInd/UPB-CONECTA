import { describe, it, expect } from 'vitest';
import { UpdateNotificationPreferences } from '../../../src/contexts/notifications/application/UpdateNotificationPreferences.js';
import { GetNotificationPreferences } from '../../../src/contexts/notifications/application/GetNotificationPreferences.js';
import { NotificationPreferencesPolicy, InvalidLeadTimeError } from '../../../src/contexts/notifications/domain/services/NotificationPreferencesPolicy.js';
import { InMemoryNotificationPreferencesRepository } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/InMemoryNotificationPreferencesRepository.js';
import { FixedClock } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/SystemClock.js';
import { DEFAULT_LEAD_TIME_MINUTES, DEFAULT_THEME } from '../../../src/contexts/notifications/domain/entities/NotificationPreferences.js';

function buildUseCases(clock = new FixedClock(new Date('2026-01-01T10:00:00Z'))) {
  const repository = new InMemoryNotificationPreferencesRepository();
  const policy = new NotificationPreferencesPolicy();
  return {
    repository,
    clock,
    update: new UpdateNotificationPreferences({ repository, clock, policy }),
    get: new GetNotificationPreferences({ repository, clock })
  };
}

describe('Casos de uso de preferencias de notificacion (HU-38)', () => {
  it('un estudiante sin preferencias guardadas obtiene los valores por defecto', async () => {
    const { get } = buildUseCases();
    const prefs = await get.execute({ studentId: 'est-1' });
    expect(prefs.leadTimeMinutes).toBe(DEFAULT_LEAD_TIME_MINUTES);
    expect(prefs.theme).toBe(DEFAULT_THEME);
    expect(prefs.categoryPreferences).toEqual({});
  });

  it('criterio 1: activa/desactiva una categoria de forma independiente sin afectar las demas', async () => {
    const { update, get } = buildUseCases();
    await update.execute({ studentId: 'est-1', categoryChanges: { becas: false } });
    await update.execute({ studentId: 'est-1', categoryChanges: { practicas: false } });

    const prefs = await get.execute({ studentId: 'est-1' });
    expect(prefs.categoryPreferences).toEqual({ becas: false, practicas: false });
  });

  it('criterio 3/6: la anticipacion y el tema se guardan y se recuperan igual entre "sesiones"', async () => {
    const { update, get } = buildUseCases();
    await update.execute({ studentId: 'est-1', leadTimeMinutes: 180, theme: 'dark' });

    const prefs = await get.execute({ studentId: 'est-1' });
    expect(prefs.leadTimeMinutes).toBe(180);
    expect(prefs.theme).toBe('dark');
  });

  it('criterio 5: rechaza un valor de anticipacion fuera de catalogo sin persistir nada', async () => {
    const { update, repository } = buildUseCases();
    await expect(update.execute({ studentId: 'est-1', leadTimeMinutes: 30 })).rejects.toThrow(InvalidLeadTimeError);
    expect(await repository.findByStudent('est-1')).toBeNull();
  });

  it('un cambio parcial conserva el resto de las preferencias ya guardadas', async () => {
    const { update } = buildUseCases();
    await update.execute({ studentId: 'est-1', categoryChanges: { becas: false }, leadTimeMinutes: 60, theme: 'dark' });
    const actualizado = await update.execute({ studentId: 'est-1', categoryChanges: { practicas: false } });

    expect(actualizado.categoryPreferences).toEqual({ becas: false, practicas: false });
    expect(actualizado.leadTimeMinutes).toBe(60); // no se toco en el segundo cambio, se conserva
    expect(actualizado.theme).toBe('dark');
  });
});
