import type { ConvocatoriaPersonalState } from '../../entities/ConvocatoriaPersonalState.js';

export interface ListSavedConvocatoriasQuery {
  readonly studentId: string;
}

export interface ListSavedConvocatoriasPort {
  execute(query: ListSavedConvocatoriasQuery): Promise<readonly ConvocatoriaPersonalState[]>;
}
