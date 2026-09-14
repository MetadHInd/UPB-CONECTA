import type { NotificationPreferences } from '../../../../domain/entities/NotificationPreferences.js';
import type { NotificationPreferencesRepositoryPort } from '../../../../domain/ports/out/NotificationPreferencesRepositoryPort.js';

export class InMemoryNotificationPreferencesRepository implements NotificationPreferencesRepositoryPort {
  private readonly byStudent = new Map<string, NotificationPreferences>();

  async findByStudent(studentId: string): Promise<NotificationPreferences | null> {
    return this.byStudent.get(studentId) ?? null;
  }

  async save(preferences: NotificationPreferences): Promise<void> {
    this.byStudent.set(preferences.studentId, preferences);
  }
}
