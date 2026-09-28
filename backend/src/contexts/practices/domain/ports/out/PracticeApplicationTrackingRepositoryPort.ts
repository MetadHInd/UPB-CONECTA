import type { PracticeApplicationStatus, PracticeApplicationTracking } from '../../entities/PracticeApplicationTracking.js';

/**
 * Seguimiento de postulaciones (HU-23). Toda lectura parte del estudiante,
 * salvo `findTrackingStudents`, que existe solo para el planificador de
 * recordatorios: ningun caso de uso expone a terceros quien sigue una oferta
 * (criterio 4).
 */
export interface PracticeApplicationTrackingRepositoryPort {
  findByStudentAndOffer(studentId: string, offerId: string): Promise<PracticeApplicationTracking | null>;
  findByStudent(studentId: string): Promise<readonly PracticeApplicationTracking[]>;
  /** Upsert por estudiante y oferta. */
  save(tracking: PracticeApplicationTracking): Promise<void>;
  /**
   * Criterio 3: por oferta, los estudiantes que la siguen en alguno de los
   * estados dados. Una oferta sin seguidores no aparece en el mapa.
   */
  findTrackingStudents(
    offerIds: readonly string[],
    statuses: readonly PracticeApplicationStatus[]
  ): Promise<ReadonlyMap<string, readonly string[]>>;
  /** HU-48 (supresion): borra el seguimiento del estudiante; devuelve cuantos registros elimino. */
  deleteAllByStudent(studentId: string): Promise<number>;
}
