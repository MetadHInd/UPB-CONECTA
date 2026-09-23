import type { ConvocatoriaPersonalState } from '../../entities/ConvocatoriaPersonalState.js';

export interface ListArchivedConvocatoriasQuery {
  readonly studentId: string;
}

export interface ListArchivedConvocatoriasPort {
  /** Criterio 3: el archivado no aparece en el listado principal pero sigue siendo recuperable. */
  execute(query: ListArchivedConvocatoriasQuery): Promise<readonly ConvocatoriaPersonalState[]>;
}
