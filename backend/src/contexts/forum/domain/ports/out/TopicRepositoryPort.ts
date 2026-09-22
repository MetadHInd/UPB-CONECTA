import type { Topic } from '../../entities/Topic.js';

/**
 * Temas como datos administrables (HU-30 criterio 5), mismo patron que
 * `PostProcessingRuleRepositoryPort` (HU-09): los casos de uso leen en cada
 * operacion, sin cache, para que un cambio del administrador aplique en la
 * siguiente peticion sin redespliegue.
 */
export interface TopicRepositoryPort {
  findById(id: string): Promise<Topic | null>;
  /** Incluye retirados: vista de administracion. */
  findAll(): Promise<readonly Topic[]>;
  findActive(): Promise<readonly Topic[]>;
  /** Inserta solo si no existe. `false` si el id ya estaba ocupado. */
  create(topic: Topic): Promise<boolean>;
  /** Reemplaza un tema existente. */
  update(topic: Topic): Promise<void>;
}
