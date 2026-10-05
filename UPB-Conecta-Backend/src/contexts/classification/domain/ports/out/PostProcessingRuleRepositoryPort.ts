import type { PostProcessingRuleData } from '../../rules/PostProcessingRuleData.js';

/**
 * Puerto de persistencia de reglas de posprocesamiento. `ClassifyInstitutionalMessage`
 * llama a `findActiveRules()` en cada ejecucion (no cachea el resultado en
 * memoria del proceso) para que agregar, editar o desactivar una regla surta
 * efecto en la siguiente ingesta sin redespliegue (RF-13, criterio 5).
 */
export interface PostProcessingRuleRepositoryPort {
  findActiveRules(): Promise<readonly PostProcessingRuleData[]>;
  findAll(): Promise<readonly PostProcessingRuleData[]>;
  findById(id: string): Promise<PostProcessingRuleData | null>;
  save(rule: PostProcessingRuleData): Promise<void>;
  setActive(id: string, active: boolean): Promise<void>;
}
