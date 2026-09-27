import { isOverdue } from '../domain/entities/ErasureRequest.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ErasureRequestRepositoryPort } from '../domain/ports/out/ErasureRequestRepositoryPort.js';
import type { ErasureExecutor } from './ErasureExecutor.js';

export interface PendingErasuresSummary {
  readonly completed: number;
  readonly stillPending: number;
  /** Solicitudes pendientes que ya pasaron su fecha limite: incumplen la politica y requieren atencion. */
  readonly overdueRequestIds: readonly string[];
}

/**
 * Trabajo periodico (criterio 4): reintenta las supresiones que no terminaron
 * y reporta las que ya superaron el plazo. Lo invoca un planificador, no un
 * usuario: no recibe sujeto de una sesion.
 */
export class ProcessPendingErasures {
  constructor(
    private readonly dependencies: {
      readonly executor: ErasureExecutor;
      readonly requests: ErasureRequestRepositoryPort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(): Promise<PendingErasuresSummary> {
    const { executor, requests, clock } = this.dependencies;
    let completed = 0;
    const stillPending: string[] = [];
    const overdue: string[] = [];

    for (const request of await requests.findPending()) {
      const result = await executor.run(request);
      if (result.status === 'completed') {
        completed += 1;
        continue;
      }
      stillPending.push(result.id);
      if (isOverdue(result, clock.now())) overdue.push(result.id);
    }
    return { completed, stillPending: stillPending.length, overdueRequestIds: overdue };
  }
}
