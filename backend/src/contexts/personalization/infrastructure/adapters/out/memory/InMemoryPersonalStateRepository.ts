import type { ConvocatoriaPersonalState } from '../../../../domain/entities/ConvocatoriaPersonalState.js';
import type { PersonalStateRepositoryPort } from '../../../../domain/ports/out/PersonalStateRepositoryPort.js';

function key(studentId: string, convocatoriaId: string): string {
  return `${studentId}|${convocatoriaId}`;
}

export class InMemoryPersonalStateRepository implements PersonalStateRepositoryPort {
  private readonly states = new Map<string, ConvocatoriaPersonalState>();

  async findByStudentAndConvocatoria(studentId: string, convocatoriaId: string): Promise<ConvocatoriaPersonalState | null> {
    return this.states.get(key(studentId, convocatoriaId)) ?? null;
  }

  async save(state: ConvocatoriaPersonalState): Promise<void> {
    this.states.set(key(state.studentId, state.convocatoriaId), state);
  }

  async findSavedByStudent(studentId: string): Promise<readonly ConvocatoriaPersonalState[]> {
    return [...this.states.values()].filter((s) => s.studentId === studentId && s.saved);
  }

  async findArchivedByStudent(studentId: string): Promise<readonly ConvocatoriaPersonalState[]> {
    return [...this.states.values()].filter((s) => s.studentId === studentId && s.archived);
  }
}
