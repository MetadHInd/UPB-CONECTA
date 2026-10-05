import type { NotificationPreferences } from '../domain/entities/NotificationPreferences.js';
import { defaultPreferences } from '../domain/entities/NotificationPreferences.js';
import type {
  UpdateNotificationPreferencesCommand,
  UpdateNotificationPreferencesPort
} from '../domain/ports/in/UpdateNotificationPreferencesPort.js';
import type { NotificationPreferencesRepositoryPort } from '../domain/ports/out/NotificationPreferencesRepositoryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { NotificationPreferencesPolicy } from '../domain/services/NotificationPreferencesPolicy.js';

export interface UpdateNotificationPreferencesDependencies {
  readonly repository: NotificationPreferencesRepositoryPort;
  readonly clock: ClockPort;
  readonly policy: NotificationPreferencesPolicy;
}

/**
 * HU-38, criterios 1, 5 y 6: aplica solo los cambios recibidos sobre las
 * preferencias vigentes (o las por defecto, en el primer guardado). Rechaza
 * una anticipacion fuera de catalogo antes de persistir nada (criterio 5).
 *
 * Criterio 4 (recalcular avisos ya programados al cambiar la anticipacion)
 * queda diferido: no existe todavia un planificador de avisos que programe
 * nada que recalcular — ver README del contexto.
 */
export class UpdateNotificationPreferences implements UpdateNotificationPreferencesPort {
  constructor(private readonly deps: UpdateNotificationPreferencesDependencies) {}

  async execute(command: UpdateNotificationPreferencesCommand): Promise<NotificationPreferences> {
    const { repository, clock, policy } = this.deps;

    if (command.leadTimeMinutes !== undefined) {
      policy.assertValidLeadTime(command.leadTimeMinutes);
    }

    const now = clock.now();
    const current = (await repository.findByStudent(command.studentId)) ?? defaultPreferences(command.studentId, now);

    const updated: NotificationPreferences = {
      studentId: command.studentId,
      categoryPreferences: { ...current.categoryPreferences, ...command.categoryChanges },
      leadTimeMinutes: command.leadTimeMinutes ?? current.leadTimeMinutes,
      theme: command.theme ?? current.theme,
      updatedAt: now
    };

    await repository.save(updated);
    return updated;
  }
}
