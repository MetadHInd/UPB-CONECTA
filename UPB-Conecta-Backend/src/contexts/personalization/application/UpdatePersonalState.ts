import type { ConvocatoriaPersonalState } from '../domain/entities/ConvocatoriaPersonalState.js';
import { defaultPersonalState } from '../domain/entities/ConvocatoriaPersonalState.js';
import type { UpdatePersonalStateCommand, UpdatePersonalStatePort } from '../domain/ports/in/UpdatePersonalStatePort.js';
import type { PersonalStateRepositoryPort } from '../domain/ports/out/PersonalStateRepositoryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';

export interface UpdatePersonalStateDependencies {
  readonly repository: PersonalStateRepositoryPort;
  readonly clock: ClockPort;
}

/**
 * HU-16, criterios 1, 2 y 3: aplica solo las banderas recibidas sobre el
 * estado vigente (o los valores por defecto, en el primer marcado). Leer,
 * guardar y archivar son independientes entre si — marcar una convocatoria
 * como archivada no le quita el "guardada" que ya tenia, por ejemplo.
 */
export class UpdatePersonalState implements UpdatePersonalStatePort {
  constructor(private readonly deps: UpdatePersonalStateDependencies) {}

  async execute(command: UpdatePersonalStateCommand): Promise<ConvocatoriaPersonalState> {
    const { repository, clock } = this.deps;
    const now = clock.now();
    const current =
      (await repository.findByStudentAndConvocatoria(command.studentId, command.convocatoriaId)) ??
      defaultPersonalState(command.studentId, command.convocatoriaId, now);

    const updated: ConvocatoriaPersonalState = {
      studentId: command.studentId,
      convocatoriaId: command.convocatoriaId,
      read: command.read ?? current.read,
      saved: command.saved ?? current.saved,
      archived: command.archived ?? current.archived,
      updatedAt: now
    };

    await repository.save(updated);
    return updated;
  }
}
