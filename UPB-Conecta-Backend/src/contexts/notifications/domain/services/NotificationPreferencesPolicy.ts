import { ALLOWED_LEAD_TIMES_MINUTES, type NotificationPreferences } from '../entities/NotificationPreferences.js';

export class InvalidLeadTimeError extends Error {
  constructor(minutes: number) {
    super(`La anticipacion ${minutes} minutos no esta entre los valores admitidos: ${ALLOWED_LEAD_TIMES_MINUTES.join(', ')}`);
    this.name = 'InvalidLeadTimeError';
  }
}

/**
 * HU-38, criterios 1, 2 y 5: reglas puras sobre preferencias, sin I/O.
 */
export class NotificationPreferencesPolicy {
  /** Una categoria ausente del mapa esta activa por defecto (opt-out). */
  isCategoryEnabled(preferences: NotificationPreferences, category: string): boolean {
    return preferences.categoryPreferences[category] !== false;
  }

  /** Lanza si la anticipacion no esta entre los valores que el servidor admite. Criterio 5. */
  assertValidLeadTime(minutes: number): void {
    if (!ALLOWED_LEAD_TIMES_MINUTES.includes(minutes)) {
      throw new InvalidLeadTimeError(minutes);
    }
  }
}
