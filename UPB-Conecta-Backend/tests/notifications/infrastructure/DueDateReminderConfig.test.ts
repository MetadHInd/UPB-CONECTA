import { describe, it, expect } from 'vitest';
import {
  readDueDateReminderConfig,
  InvalidDueDateReminderConfigError
} from '../../../src/contexts/notifications/infrastructure/config/DueDateReminderConfig.js';

describe('DueDateReminderConfig (HU-19)', () => {
  it('usa valores por defecto cuando no hay variables de entorno', () => {
    const config = readDueDateReminderConfig({});
    expect(config.pollIntervalMs).toBeGreaterThan(0);
    expect(config.pollIntervalMs).toBeLessThanOrEqual(60_000);
    expect(config.systemThresholds.map((t) => t.minutes)).toEqual([1440]);
  });

  it('lee el intervalo y los umbrales desde el entorno', () => {
    const config = readDueDateReminderConfig({
      DUE_DATE_REMINDER_POLL_INTERVAL_MS: '15000',
      DUE_DATE_REMINDER_SYSTEM_THRESHOLDS_MINUTES: '60,1440,4320'
    });
    expect(config.pollIntervalMs).toBe(15_000);
    expect(config.systemThresholds.map((t) => t.minutes)).toEqual([60, 1440, 4320]);
  });

  it('criterio 2: rechaza un intervalo mayor a 60 segundos, porque no podria cumplir el margen de emision', () => {
    expect(() => readDueDateReminderConfig({ DUE_DATE_REMINDER_POLL_INTERVAL_MS: '60001' })).toThrow(
      InvalidDueDateReminderConfigError
    );
  });

  it('rechaza un intervalo no positivo', () => {
    expect(() => readDueDateReminderConfig({ DUE_DATE_REMINDER_POLL_INTERVAL_MS: '0' })).toThrow(InvalidDueDateReminderConfigError);
    expect(() => readDueDateReminderConfig({ DUE_DATE_REMINDER_POLL_INTERVAL_MS: 'abc' })).toThrow(InvalidDueDateReminderConfigError);
  });

  it('rechaza una lista de umbrales con un valor invalido', () => {
    expect(() => readDueDateReminderConfig({ DUE_DATE_REMINDER_SYSTEM_THRESHOLDS_MINUTES: '60,0,120' })).toThrow(
      InvalidDueDateReminderConfigError
    );
  });
});
