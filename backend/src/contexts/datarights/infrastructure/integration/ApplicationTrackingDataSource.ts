import type { PersonalStateRepositoryPort } from '../../../personalization/domain/ports/out/PersonalStateRepositoryPort.js';
import type { PracticeApplicationTrackingRepositoryPort } from '../../../practices/domain/ports/out/PracticeApplicationTrackingRepositoryPort.js';
import type { PersonalDataRecord } from '../../domain/entities/PersonalDataArea.js';
import type { PersonalDataSourcePort } from '../../domain/ports/out/PersonalDataSourcePort.js';

/**
 * Seguimiento de convocatorias del estudiante: leidas, guardadas y archivadas
 * (HU-16), y el estado de sus postulaciones a practicas (HU-23). Es el estado
 * que el estudiante lleva de sus postulaciones.
 */
export class ApplicationTrackingDataSource implements PersonalDataSourcePort {
  readonly area = 'applicationTracking' as const;

  constructor(
    private readonly states: PersonalStateRepositoryPort,
    private readonly practiceTrackings: PracticeApplicationTrackingRepositoryPort
  ) {}

  async collect(subject: string): Promise<readonly PersonalDataRecord[]> {
    const [states, practices] = await Promise.all([this.states.findAllByStudent(subject), this.practiceTrackings.findByStudent(subject)]);
    return [
      ...states.map((state) => ({
        convocatoriaId: state.convocatoriaId,
        read: state.read,
        saved: state.saved,
        archived: state.archived,
        updatedAt: state.updatedAt
      })),
      ...practices.map((tracking) => ({
        practiceOffer: tracking.offerTitle,
        applicationStatus: tracking.status,
        statusHistory: tracking.history.map((change) => `${change.status} (${change.at.toISOString()})`).join(', '),
        updatedAt: tracking.updatedAt
      }))
    ];
  }

  async erase(subject: string): Promise<number> {
    const [states, practices] = await Promise.all([this.states.deleteAllByStudent(subject), this.practiceTrackings.deleteAllByStudent(subject)]);
    return states + practices;
  }
}
