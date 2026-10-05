import type { ConvocatoriaPersonalState } from '../domain/entities/ConvocatoriaPersonalState.js';
import type { ListSavedConvocatoriasPort, ListSavedConvocatoriasQuery } from '../domain/ports/in/ListSavedConvocatoriasPort.js';
import type { PersonalStateRepositoryPort } from '../domain/ports/out/PersonalStateRepositoryPort.js';

export interface ListSavedConvocatoriasDependencies {
  readonly repository: PersonalStateRepositoryPort;
}

/** HU-16, criterio 2: vista de guardados independiente del feed principal. */
export class ListSavedConvocatorias implements ListSavedConvocatoriasPort {
  constructor(private readonly deps: ListSavedConvocatoriasDependencies) {}

  async execute(query: ListSavedConvocatoriasQuery): Promise<readonly ConvocatoriaPersonalState[]> {
    return this.deps.repository.findSavedByStudent(query.studentId);
  }
}
