import type { Infraction } from '../../entities/Infraction.js';

/**
 * Historial de infracciones del foro (HU-35 criterios 1 y 5): fuente de
 * verdad de la gradualidad. Sin el, la sancion no es defendible.
 */
export interface InfractionRepositoryPort {
  findById(id: string): Promise<Infraction | null>;
  /** Inserta solo si no existe. `false` si ya habia una infraccion para ese contenido. */
  create(infraction: Infraction): Promise<boolean>;
  /** Reemplaza una existente (un contenido retenido que la moderacion termina bloqueando). */
  update(infraction: Infraction): Promise<void>;
  /** `email` ya normalizado. Mas reciente primero. */
  findByStudent(email: string): Promise<readonly Infraction[]>;
}
