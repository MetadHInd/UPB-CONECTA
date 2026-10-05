import type { ConvocatoriaPersonalState } from '../../entities/ConvocatoriaPersonalState.js';

export interface GetPersonalStateQuery {
  readonly studentId: string;
  readonly convocatoriaId: string;
}

export interface GetPersonalStatePort {
  /** Vigente del estudiante, o los valores por defecto si nunca la marco. */
  execute(query: GetPersonalStateQuery): Promise<ConvocatoriaPersonalState>;
}
