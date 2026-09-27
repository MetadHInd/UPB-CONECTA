import type { NotificationPreferences } from '../../entities/NotificationPreferences.js';

export interface NotificationPreferencesRepositoryPort {
  findByStudent(studentId: string): Promise<NotificationPreferences | null>;
  /** Upsert: a diferencia del consentimiento, aqui solo importa el estado vigente, no el historico. */
  save(preferences: NotificationPreferences): Promise<void>;
  /** HU-48 (supresion): borra las preferencias; `true` si existian. */
  delete(studentId: string): Promise<boolean>;
}
