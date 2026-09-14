import type { NotificationPreferences, ThemePreference } from '../../entities/NotificationPreferences.js';

export interface UpdateNotificationPreferencesCommand {
  readonly studentId: string;
  /** Solo las categorias que cambian; el resto conserva su valor actual. */
  readonly categoryChanges?: Readonly<Record<string, boolean>>;
  readonly leadTimeMinutes?: number;
  readonly theme?: ThemePreference;
}

export interface UpdateNotificationPreferencesPort {
  execute(command: UpdateNotificationPreferencesCommand): Promise<NotificationPreferences>;
}
