import { describe, it, expect } from 'vitest';
import { NotificationBatchingPolicy } from '../../../src/contexts/notifications/domain/services/NotificationBatchingPolicy.js';
import type { PendingNotification } from '../../../src/contexts/notifications/domain/entities/PendingNotification.js';

const WINDOW_MS = 10 * 60 * 1000; // 10 minutos

function notification(overrides: Partial<PendingNotification> = {}): PendingNotification {
  return {
    studentId: 'est-1',
    convocatoriaId: 'conv-1',
    urgency: 1,
    generatedAt: new Date('2026-01-01T10:00:00Z'),
    ...overrides
  };
}

describe('NotificationBatchingPolicy', () => {
  it('rechaza un limite diario no positivo en la construccion', () => {
    expect(() => new NotificationBatchingPolicy(WINDOW_MS, 0)).toThrow(RangeError);
    expect(() => new NotificationBatchingPolicy(WINDOW_MS, -1)).toThrow(RangeError);
  });

  it('rechaza una ventana no positiva en la construccion', () => {
    expect(() => new NotificationBatchingPolicy(0, 5)).toThrow(RangeError);
  });

  describe('groupByWindow (criterio 1)', () => {
    const policy = new NotificationBatchingPolicy(WINDOW_MS, 100);

    it('agrupa avisos del mismo estudiante dentro de la misma ventana en un solo lote', () => {
      const batches = policy.groupByWindow([
        notification({ convocatoriaId: 'a', generatedAt: new Date('2026-01-01T10:00:00Z') }),
        notification({ convocatoriaId: 'b', generatedAt: new Date('2026-01-01T10:05:00Z') })
      ]);

      expect(batches).toHaveLength(1);
      expect(batches[0]?.notifications).toHaveLength(2);
    });

    it('no agrupa avisos de ventanas distintas', () => {
      const batches = policy.groupByWindow([
        notification({ convocatoriaId: 'a', generatedAt: new Date('2026-01-01T10:00:00Z') }),
        notification({ convocatoriaId: 'b', generatedAt: new Date('2026-01-01T10:15:00Z') })
      ]);

      expect(batches).toHaveLength(2);
    });

    it('no agrupa avisos de estudiantes distintos aunque coincidan en el tiempo', () => {
      const batches = policy.groupByWindow([
        notification({ studentId: 'est-1' }),
        notification({ studentId: 'est-2' })
      ]);

      expect(batches).toHaveLength(2);
    });

    it('el lote conserva la urgencia maxima de sus avisos', () => {
      const batches = policy.groupByWindow([
        notification({ urgency: 2 }),
        notification({ urgency: 5, generatedAt: new Date('2026-01-01T10:02:00Z') })
      ]);
      expect(batches[0]?.maxUrgency).toBe(5);
    });
  });

  describe('applyDailyLimit (criterio 2)', () => {
    it('envia todos los lotes cuando no se supera el limite diario', () => {
      const policy = new NotificationBatchingPolicy(WINDOW_MS, 5);
      const batches = policy.groupByWindow([notification({ generatedAt: new Date('2026-01-01T10:00:00Z') })]);

      const { toSend, deferred } = policy.applyDailyLimit(batches, new Map());
      expect(toSend).toHaveLength(1);
      expect(deferred).toHaveLength(0);
    });

    it('difiere sin perder los lotes que exceden el limite diario', () => {
      const policy = new NotificationBatchingPolicy(WINDOW_MS, 1);
      const batches = policy.groupByWindow([
        notification({ convocatoriaId: 'a', generatedAt: new Date('2026-01-01T10:00:00Z') }),
        notification({ convocatoriaId: 'b', generatedAt: new Date('2026-01-01T11:00:00Z'), urgency: 1 })
      ]);

      const { toSend, deferred } = policy.applyDailyLimit(batches, new Map());
      expect(toSend).toHaveLength(1);
      expect(deferred).toHaveLength(1);
    });

    it('respeta lo ya enviado hoy al calcular el cupo restante', () => {
      const policy = new NotificationBatchingPolicy(WINDOW_MS, 2);
      const batches = policy.groupByWindow([notification()]);

      const { toSend, deferred } = policy.applyDailyLimit(batches, new Map([['est-1', 2]]));
      expect(toSend).toHaveLength(0);
      expect(deferred).toHaveLength(1);
    });

    it('criterio 6: entre varios lotes que exceden el cupo, prioriza los mas urgentes', () => {
      const policy = new NotificationBatchingPolicy(WINDOW_MS, 1);
      const urgente = { studentId: 'est-1', notifications: [notification({ urgency: 9 })], maxUrgency: 9 };
      const pocoUrgente = { studentId: 'est-1', notifications: [notification({ urgency: 1 })], maxUrgency: 1 };

      const { toSend, deferred } = policy.applyDailyLimit([pocoUrgente, urgente], new Map());
      expect(toSend).toEqual([urgente]);
      expect(deferred).toEqual([pocoUrgente]);
    });

    it('el cupo diario es independiente por estudiante', () => {
      const policy = new NotificationBatchingPolicy(WINDOW_MS, 1);
      const batches = policy.groupByWindow([
        notification({ studentId: 'est-1' }),
        notification({ studentId: 'est-2' })
      ]);

      const { toSend, deferred } = policy.applyDailyLimit(batches, new Map());
      expect(toSend).toHaveLength(2);
      expect(deferred).toHaveLength(0);
    });
  });
});
