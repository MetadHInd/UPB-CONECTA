import { describe, it, expect } from 'vitest';
import {
  readNotificationBatchingConfig,
  InvalidNotificationBatchingConfigError
} from '../../../src/contexts/notifications/infrastructure/config/NotificationBatchingConfig.js';

describe('readNotificationBatchingConfig, criterio 3', () => {
  it('usa valores por defecto cuando el entorno no declara nada', () => {
    const config = readNotificationBatchingConfig({});
    expect(config.windowMs).toBe(15 * 60 * 1000);
    expect(config.dailyLimit).toBe(5);
  });

  it('toma el limite diario y la ventana del entorno sin recompilar', () => {
    const config = readNotificationBatchingConfig({
      NOTIFICATION_DAILY_LIMIT: '10',
      NOTIFICATION_BATCH_WINDOW_MS: '600000'
    });
    expect(config.dailyLimit).toBe(10);
    expect(config.windowMs).toBe(600_000);
  });

  it('rechaza valores no numericos o no enteros', () => {
    expect(() => readNotificationBatchingConfig({ NOTIFICATION_DAILY_LIMIT: 'alto' })).toThrow(
      InvalidNotificationBatchingConfigError
    );
    expect(() => readNotificationBatchingConfig({ NOTIFICATION_DAILY_LIMIT: '0' })).toThrow(
      InvalidNotificationBatchingConfigError
    );
    expect(() => readNotificationBatchingConfig({ NOTIFICATION_BATCH_WINDOW_MS: '5.5' })).toThrow(
      InvalidNotificationBatchingConfigError
    );
  });
});
