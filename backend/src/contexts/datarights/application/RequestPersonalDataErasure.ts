import { openErasureRequest, type ErasedCounts } from '../domain/entities/ErasureRequest.js';
import type { RetainedRecordNotice, RetentionPolicy } from '../domain/entities/RetentionPolicy.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ErasureRequestRepositoryPort } from '../domain/ports/out/ErasureRequestRepositoryPort.js';
import type { IdentifierGeneratorPort } from '../domain/ports/out/IdentifierGeneratorPort.js';
import type { ErasureExecutor } from './ErasureExecutor.js';
import { normalizeSubject } from './normalizeSubject.js';

export type ErasureConfirmation =
  | {
      /** Criterio 7: resultado y fecha de ejecucion. */
      readonly status: 'completed';
      readonly requestId: string;
      readonly requestedAt: Date;
      readonly executedAt: Date;
      readonly erased: ErasedCounts;
      readonly retained: readonly RetainedRecordNotice[];
      readonly message: string;
    }
  | {
      /** La ejecucion fallo; se reintenta y la politica fija hasta cuando. */
      readonly status: 'pending';
      readonly requestId: string;
      readonly requestedAt: Date;
      readonly dueBy: Date;
      readonly message: string;
    };

/**
 * Solicitud de supresion (HU-48 criterios 4, 5 y 7). Registra la solicitud con
 * su fecha limite segun la politica y la ejecuta de inmediato: la politica fija
 * un plazo maximo, no una espera. Si algo falla queda pendiente y
 * `ProcessPendingErasures` la reintenta hasta cumplirla o marcarla vencida.
 * Repetir la peticion mientras hay una pendiente no abre otra: reintenta la misma.
 */
export class RequestPersonalDataErasure {
  constructor(
    private readonly dependencies: {
      readonly executor: ErasureExecutor;
      readonly requests: ErasureRequestRepositoryPort;
      readonly ids: IdentifierGeneratorPort;
      readonly policy: RetentionPolicy;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: { readonly subject: string }): Promise<ErasureConfirmation> {
    const { executor, requests, ids, policy, clock } = this.dependencies;
    const subject = normalizeSubject(input.subject);

    const existing = await requests.findPendingBySubject(subject);
    const request = existing ?? openErasureRequest(ids.newRequestId(), subject, clock.now(), policy);
    if (existing === null) await requests.save(request);

    const result = await executor.run(request);
    if (result.status === 'completed' && result.executedAt !== null) {
      return {
        status: 'completed',
        requestId: result.id,
        requestedAt: result.requestedAt,
        executedAt: result.executedAt,
        erased: result.erasedCounts ?? {},
        retained: policy.retainedRecords,
        message: 'Sus datos fueron suprimidos. Lo que la ley obliga a conservar quedó disociado y ya no permite identificarlo.'
      };
    }
    return {
      status: 'pending',
      requestId: result.id,
      requestedAt: result.requestedAt,
      dueBy: result.dueBy,
      message: `No pudimos completar la supresión todavía. Se reintentará automáticamente y se cumplirá a más tardar el ${result.dueBy.toISOString()}.`
    };
  }
}
