import type { NotificationPreferences } from '../../entities/NotificationPreferences.js';

export interface GetNotificationPreferencesQuery {
  readonly studentId: string;
}

export interface GetNotificationPreferencesPort {
  /** Vigentes del estudiante, o los valores por defecto si nunca las guardo. */
  execute(query: GetNotificationPreferencesQuery): Promise<NotificationPreferences>;
}
