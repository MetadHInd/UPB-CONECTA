import type { MessageCategory } from '../../value-objects/MessageCategory.js';

/**
 * Un par (mensaje, categoria verdadera) etiquetado por un humano — la verdad
 * de referencia (ground truth) que los criterios 5 y 6 de HU-10 necesitan
 * para calcular precision y cobertura. De donde salen estos datos (quien
 * etiqueta, con que proceso, sobre que muestra) es responsabilidad explicita
 * de otro proceso/historia fuera de este alcance: este repositorio solo
 * persiste los pares ya etiquetados, no los genera ni los valida.
 */
export interface LabeledSample {
  readonly messageId: string;
  readonly actualCategory: MessageCategory;
}

export interface LabeledSampleRepositoryPort {
  save(sample: LabeledSample): Promise<void>;
  findAll(): Promise<readonly LabeledSample[]>;
}
