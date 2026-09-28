import type { ConvocatoriaFollowersPort } from '../../../../domain/ports/out/ConvocatoriaFollowersPort.js';
import {
  PRACTICE_APPLICATION_STATUSES,
  wantsClosingReminder
} from '../../../../../practices/domain/entities/PracticeApplicationTracking.js';
import type { PracticeApplicationTrackingRepositoryPort } from '../../../../../practices/domain/ports/out/PracticeApplicationTrackingRepositoryPort.js';

/**
 * Implementa `ConvocatoriaFollowersPort` leyendo el seguimiento de
 * postulaciones de `practices` (HU-23). Que estados piden recordatorio lo
 * decide `practices` (`wantsClosingReminder`), no este adaptador. El
 * `offerId` del seguimiento es el `representativeMessageId`, asi que no hay
 * traduccion de identidad.
 */
export class PracticeTrackingFollowersAdapter implements ConvocatoriaFollowersPort {
  private static readonly REMINDED = PRACTICE_APPLICATION_STATUSES.filter(wantsClosingReminder);

  constructor(private readonly trackings: PracticeApplicationTrackingRepositoryPort) {}

  async findFollowers(representativeMessageIds: readonly string[]): Promise<ReadonlyMap<string, readonly string[]>> {
    return this.trackings.findTrackingStudents(representativeMessageIds, PracticeTrackingFollowersAdapter.REMINDED);
  }
}
