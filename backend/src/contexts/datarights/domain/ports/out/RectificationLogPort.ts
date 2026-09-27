import type { RectificationEntry } from '../../entities/RectificationEntry.js';

/** Historial append-only de correcciones (criterio 2). Se suprime junto con el titular. */
export interface RectificationLogPort {
  record(entry: RectificationEntry): Promise<void>;
  /** Mas reciente primero. */
  findBySubject(subject: string): Promise<readonly RectificationEntry[]>;
  deleteBySubject(subject: string): Promise<number>;
}
