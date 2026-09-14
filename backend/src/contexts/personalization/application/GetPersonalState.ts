import type { ConvocatoriaPersonalState } from '../domain/entities/ConvocatoriaPersonalState.js';
import { defaultPersonalState } from '../domain/entities/ConvocatoriaPersonalState.js';
import type { GetPersonalStatePort, GetPersonalStateQuery } from '../domain/ports/in/GetPersonalStatePort.js';
import type { PersonalStateRepositoryPort } from '../domain/ports/out/PersonalStateRepositoryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';

export interface GetPersonalStateDependencies {
  readonly repository: PersonalStateRepositoryPort;
  readonly clock: ClockPort;
}

/** HU-16, criterios 1 y 5: el estado se refleja al reabrir y es independiente por estudiante. */
export class GetPersonalState implements GetPersonalStatePort {
  constructor(private readonly deps: GetPersonalStateDependencies) {}

  async execute(query: GetPersonalStateQuery): Promise<ConvocatoriaPersonalState> {
    const existing = await this.deps.repository.findByStudentAndConvocatoria(query.studentId, query.convocatoriaId);
    return existing ?? defaultPersonalState(query.studentId, query.convocatoriaId, this.deps.clock.now());
  }
}
