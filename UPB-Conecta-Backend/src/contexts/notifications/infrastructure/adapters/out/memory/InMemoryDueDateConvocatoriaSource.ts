import type {
  DueDateConvocatoriaCandidate,
  DueDateConvocatoriaSourcePort
} from '../../../../domain/ports/out/DueDateConvocatoriaSourcePort.js';

/** Fuente en memoria para pruebas: los candidatos se cargan directamente, sin adaptar `ingestion`. */
export class InMemoryDueDateConvocatoriaSource implements DueDateConvocatoriaSourcePort {
  constructor(private candidates: readonly DueDateConvocatoriaCandidate[] = []) {}

  async findWithDueDate(): Promise<readonly DueDateConvocatoriaCandidate[]> {
    return this.candidates;
  }

  seed(candidates: readonly DueDateConvocatoriaCandidate[]): void {
    this.candidates = candidates;
  }
}
