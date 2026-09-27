import type { NotificationPreferencesRepositoryPort } from '../../../notifications/domain/ports/out/NotificationPreferencesRepositoryPort.js';
import type { PersonalDataRecord } from '../../domain/entities/PersonalDataArea.js';
import type { PersonalDataSourcePort } from '../../domain/ports/out/PersonalDataSourcePort.js';

/** Preferencias de notificacion y tema (HU-38). */
export class PreferencesDataSource implements PersonalDataSourcePort {
  readonly area = 'preferences' as const;

  constructor(private readonly preferences: NotificationPreferencesRepositoryPort) {}

  async collect(subject: string): Promise<readonly PersonalDataRecord[]> {
    const found = await this.preferences.findByStudent(subject);
    if (found === null) return [];
    const disabled = Object.entries(found.categoryPreferences)
      .filter(([, enabled]) => !enabled)
      .map(([category]) => category)
      .sort();
    return [
      {
        leadTimeMinutes: found.leadTimeMinutes,
        theme: found.theme,
        disabledCategories: disabled.join(', '),
        updatedAt: found.updatedAt
      }
    ];
  }

  async erase(subject: string): Promise<number> {
    return (await this.preferences.delete(subject)) ? 1 : 0;
  }
}
