import type { ConvocatoriaPersonalState } from '../domain/entities/ConvocatoriaPersonalState.js';
import type {
  ListArchivedConvocatoriasPort,
  ListArchivedConvocatoriasQuery
} from '../domain/ports/in/ListArchivedConvocatoriasPort.js';
import type { PersonalStateRepositoryPort } from '../domain/ports/out/PersonalStateRepositoryPort.js';

export interface ListArchivedConvocatoriasDependencies {
  readonly repository: PersonalStateRepositoryPort;
}

/** HU-16, criterio 3: el archivado no aparece en el listado principal pero sigue siendo recuperable. */
export class ListArchivedConvocatorias implements ListArchivedConvocatoriasPort {
  constructor(private readonly deps: ListArchivedConvocatoriasDependencies) {}

  async execute(query: ListArchivedConvocatoriasQuery): Promise<readonly ConvocatoriaPersonalState[]> {
    return this.deps.repository.findArchivedByStudent(query.studentId);
  }
}
