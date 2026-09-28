/**
 * Un texto etiquetado por una persona como ofensivo o no (HU-52 criterio 7):
 * la verdad de referencia contra la que se simula un umbral. Mismo papel que
 * `LabeledSample` del clasificador (HU-10). Cómo se construye el conjunto
 * (quién etiqueta, sobre qué muestra) es de HU-57; este repositorio solo
 * guarda lo ya etiquetado.
 */
export interface ModerationLabeledSample {
  readonly sampleId: string;
  readonly text: string;
  readonly offensive: boolean;
}

export interface ModerationLabeledSampleRepositoryPort {
  save(sample: ModerationLabeledSample): Promise<void>;
  findAll(): Promise<readonly ModerationLabeledSample[]>;
}
