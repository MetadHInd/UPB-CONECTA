import type { ConvocatoriaPersonalState } from '../../entities/ConvocatoriaPersonalState.js';

export interface PersonalStateRepositoryPort {
  findByStudentAndConvocatoria(studentId: string, convocatoriaId: string): Promise<ConvocatoriaPersonalState | null>;
  /** Upsert: solo interesa el estado vigente, no un historico de cambios. */
  save(state: ConvocatoriaPersonalState): Promise<void>;
  /** Criterio 2: vista de guardados independiente del feed principal. */
  findSavedByStudent(studentId: string): Promise<readonly ConvocatoriaPersonalState[]>;
  /** Criterio 3: los archivados siguen siendo recuperables. */
  findArchivedByStudent(studentId: string): Promise<readonly ConvocatoriaPersonalState[]>;
}
