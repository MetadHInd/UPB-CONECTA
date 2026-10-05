import { describe, it, expect } from 'vitest';
import { NotificationScheduler, computeUrgency } from '../../../src/contexts/notifications/domain/services/NotificationScheduler.js';
import { AnticipationThreshold } from '../../../src/contexts/notifications/domain/value-objects/AnticipationThreshold.js';

describe('AnticipationThreshold', () => {
  it('rechaza anticipaciones no positivas', () => {
    expect(() => AnticipationThreshold.ofMinutes(0)).toThrow(RangeError);
    expect(() => AnticipationThreshold.ofMinutes(-5)).toThrow(RangeError);
    expect(() => AnticipationThreshold.ofMinutes(Number.NaN)).toThrow(RangeError);
  });

  it('calcula el instante que antecede al cierre en la cantidad de minutos configurada', () => {
    const threshold = AnticipationThreshold.ofMinutes(60);
    const dueAt = new Date('2026-01-10T12:00:00Z');
    expect(threshold.instantFor(dueAt)).toEqual(new Date('2026-01-10T11:00:00Z'));
  });
});

describe('NotificationScheduler (HU-19, RF-27, RNF-03, RF-62)', () => {
  const dueAt = new Date('2026-01-10T12:00:00Z');

  it('criterio 1: genera un aviso por cada umbral del sistema y por el del estudiante', () => {
    const scheduler = new NotificationScheduler();
    const now = new Date('2026-01-01T00:00:00Z');
    const reminders = scheduler.computeReminders(
      dueAt,
      now,
      [AnticipationThreshold.ofMinutes(4320), AnticipationThreshold.ofMinutes(1440)],
      AnticipationThreshold.ofMinutes(180)
    );

    expect(reminders.map((r) => r.thresholdMinutes)).toEqual([4320, 1440, 180]);
    expect(reminders.every((r) => !r.immediate)).toBe(true);
    expect(reminders[0]!.firesAt).toEqual(new Date('2026-01-07T12:00:00Z')); // dueAt - 4320min (3 dias)
  });

  it('no duplica un umbral cuando el estudiante elige exactamente el mismo valor que ya trae el sistema', () => {
    const scheduler = new NotificationScheduler();
    const now = new Date('2026-01-01T00:00:00Z');
    const reminders = scheduler.computeReminders(dueAt, now, [AnticipationThreshold.ofMinutes(1440)], AnticipationThreshold.ofMinutes(1440));

    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.thresholdMinutes).toBe(1440);
  });

  it('criterio 6: un umbral cuyo instante ya paso se emite de inmediato en vez de perderse', () => {
    const scheduler = new NotificationScheduler();
    // Quedan 30 minutos para el cierre, pero el umbral pide 60.
    const now = new Date('2026-01-10T11:30:00Z');
    const reminders = scheduler.computeReminders(dueAt, now, [], AnticipationThreshold.ofMinutes(60));

    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.immediate).toBe(true);
    expect(reminders[0]!.firesAt).toEqual(now);
  });

  it('caso borde: el instante del umbral cae exactamente en "ahora" tambien cuenta como inmediato', () => {
    const scheduler = new NotificationScheduler();
    const now = new Date('2026-01-10T11:00:00Z'); // dueAt - 60min exactamente
    const reminders = scheduler.computeReminders(dueAt, now, [], AnticipationThreshold.ofMinutes(60));

    expect(reminders[0]!.immediate).toBe(true);
    expect(reminders[0]!.firesAt).toEqual(now);
  });

  it('un umbral cuyo instante todavia no llega no se marca inmediato y conserva su instante futuro', () => {
    const scheduler = new NotificationScheduler();
    const now = new Date('2026-01-01T00:00:00Z');
    const reminders = scheduler.computeReminders(dueAt, now, [], AnticipationThreshold.ofMinutes(60));

    expect(reminders[0]!.immediate).toBe(false);
    expect(reminders[0]!.firesAt).toEqual(new Date('2026-01-10T11:00:00Z'));
  });

  it('ordena los avisos por instante de disparo ascendente', () => {
    const scheduler = new NotificationScheduler();
    const now = new Date('2026-01-01T00:00:00Z');
    const reminders = scheduler.computeReminders(
      dueAt,
      now,
      [AnticipationThreshold.ofMinutes(60), AnticipationThreshold.ofMinutes(4320)],
      AnticipationThreshold.ofMinutes(1440)
    );

    const instantes = reminders.map((r) => r.firesAt.getTime());
    expect(instantes).toEqual([...instantes].sort((a, b) => a - b));
  });
});

describe('computeUrgency', () => {
  it('sin fecha concreta devuelve una urgencia base neutra', () => {
    expect(computeUrgency(null)).toBe(1);
  });

  it('a menos tiempo restante, mayor urgencia', () => {
    const unaHora = computeUrgency(60 * 60_000);
    const unDia = computeUrgency(24 * 60 * 60_000);
    expect(unaHora).toBeGreaterThan(unDia);
  });

  it('un tiempo restante negativo (borde) no lanza y se trata como cero', () => {
    expect(() => computeUrgency(-1000)).not.toThrow();
    expect(computeUrgency(-1000)).toBe(computeUrgency(0));
  });
});
