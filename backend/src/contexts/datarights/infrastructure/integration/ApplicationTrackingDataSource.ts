import type { PersonalStateRepositoryPort } from '../../../personalization/domain/ports/out/PersonalStateRepositoryPort.js';
import type { PersonalDataRecord } from '../../domain/entities/PersonalDataArea.js';
import type { PersonalDataSourcePort } from '../../domain/ports/out/PersonalDataSourcePort.js';

/**
 * Seguimiento de convocatorias del estudiante (HU-16): leidas, guardadas y
 * archivadas. Es el estado que el estudiante lleva de sus postulaciones.
 */
export class ApplicationTrackingDataSource implements PersonalDataSourcePort {
  readonly area = 'applicationTracking' as const;

  constructor(private readonly states: PersonalStateRepositoryPort) {}

  async collect(subject: string): Promise<readonly PersonalDataRecord[]> {
    const found = await this.states.findAllByStudent(subject);
    return found.map((state) => ({
      convocatoriaId: state.convocatoriaId,
      read: state.read,
      saved: state.saved,
      archived: state.archived,
      updatedAt: state.updatedAt
    }));
  }

  async erase(subject: string): Promise<number> {
    return this.states.deleteAllByStudent(subject);
  }
}
