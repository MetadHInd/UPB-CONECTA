import type { NotificationPreferences } from '../domain/entities/NotificationPreferences.js';
import { defaultPreferences } from '../domain/entities/NotificationPreferences.js';
import type { GetNotificationPreferencesPort, GetNotificationPreferencesQuery } from '../domain/ports/in/GetNotificationPreferencesPort.js';
import type { NotificationPreferencesRepositoryPort } from '../domain/ports/out/NotificationPreferencesRepositoryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';

export interface GetNotificationPreferencesDependencies {
  readonly repository: NotificationPreferencesRepositoryPort;
  readonly clock: ClockPort;
}

/**
 * HU-38, criterio 6: el tema (y el resto de preferencias) se conserva entre
 * sesiones porque vive en el servidor, no en el dispositivo. Es tambien el
 * puerto que consultara el futuro planificador de avisos (criterios 2, 3).
 */
export class GetNotificationPreferences implements GetNotificationPreferencesPort {
  constructor(private readonly deps: GetNotificationPreferencesDependencies) {}

  async execute(query: GetNotificationPreferencesQuery): Promise<NotificationPreferences> {
    const existing = await this.deps.repository.findByStudent(query.studentId);
    return existing ?? defaultPreferences(query.studentId, this.deps.clock.now());
  }
}
