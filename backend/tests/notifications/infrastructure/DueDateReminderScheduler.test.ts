import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DueDateReminderScheduler } from '../../../src/contexts/notifications/infrastructure/scheduler/DueDateReminderScheduler.js';

describe('DueDateReminderScheduler (HU-19, criterio 2)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('dispara el caso de uso en el intervalo configurado sin intervencion humana', async () => {
    let calls = 0;
    const useCase = { execute: async () => { calls += 1; } };
    const scheduler = new DueDateReminderScheduler(useCase, () => ({ pollIntervalMs: 30_000, systemThresholds: [] }));

    scheduler.start();
    expect(calls).toBe(0);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(2);

    scheduler.stop();
  });

  it('no detiene el servicio cuando un ciclo falla', async () => {
    let calls = 0;
    const errores: unknown[] = [];
    const useCase = {
      execute: async () => {
        calls += 1;
        if (calls === 1) throw new Error('fallo transitorio');
      }
    };
    const scheduler = new DueDateReminderScheduler(useCase, () => ({ pollIntervalMs: 30_000, systemThresholds: [] }), (e) => errores.push(e));

    scheduler.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(errores).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(2);

    scheduler.stop();
  });

  it('no solapa ciclos cuando una ejecucion tarda mas que el intervalo', async () => {
    let enCurso = 0;
    let maximoSimultaneo = 0;
    const useCase = {
      execute: async () => {
        enCurso += 1;
        maximoSimultaneo = Math.max(maximoSimultaneo, enCurso);
        await new Promise((r) => setTimeout(r, 90_000));
        enCurso -= 1;
      }
    };
    const scheduler = new DueDateReminderScheduler(useCase, () => ({ pollIntervalMs: 30_000, systemThresholds: [] }));
    scheduler.start();
    await vi.advanceTimersByTimeAsync(300_000);

    expect(maximoSimultaneo).toBe(1);
    scheduler.stop();
  });

  it('es seguro llamar start dos veces y stop sin haber arrancado', () => {
    const useCase = { execute: async () => {} };
    const scheduler = new DueDateReminderScheduler(useCase, () => ({ pollIntervalMs: 30_000, systemThresholds: [] }));
    scheduler.stop();
    scheduler.start();
    scheduler.start();
    expect(scheduler.isRunning).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning).toBe(false);
  });
});
