import type { ReviewThreshold } from '../../value-objects/ReviewThreshold.js';

/**
 * Puerto de configuracion del umbral de revision (HU-10, criterio 4). Sigue
 * el mismo patron que `PostProcessingRuleRepositoryPort` de HU-09: se lee
 * fresco en cada ejecucion (nunca cacheado de forma permanente en memoria del
 * proceso), para que un cambio del administrador aplique a las
 * clasificaciones siguientes sin redespliegue.
 */
export interface ReviewThresholdConfigPort {
  get(): Promise<ReviewThreshold>;
  set(threshold: ReviewThreshold): Promise<void>;
}
