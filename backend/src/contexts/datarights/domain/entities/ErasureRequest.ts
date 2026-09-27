import { addDays, type RetentionPolicy } from './RetentionPolicy.js';
import type { PersonalDataArea } from './PersonalDataArea.js';

export type ErasureStatus = 'pending' | 'completed';

export type ErasedCounts = Readonly<Partial<Record<PersonalDataArea, number>>>;

/**
 * Solicitud de supresion (HU-48 criterios 4, 5 y 7). Mientras esta pendiente
 * guarda el correo del titular, porque es lo unico que permite reintentar. Al
 * completarse el correo se descarta (`subject = null`) y queda solo el
 * seudonimo sin correspondencia: la solicitud es prueba de que se cumplio el
 * plazo, no una via para reidentificar.
 */
export interface ErasureRequest {
  readonly id: string;
  readonly subject: string | null;
  readonly requestedAt: Date;
  /** Fecha limite de ejecucion segun la politica vigente al solicitar. */
  readonly dueBy: Date;
  readonly status: ErasureStatus;
  readonly executedAt: Date | null;
  readonly pseudonym: string | null;
  readonly erasedCounts: ErasedCounts | null;
  readonly dissociatedRecords: number | null;
  readonly attempts: number;
  readonly lastFailure: string | null;
}

export function openErasureRequest(id: string, subject: string, at: Date, policy: RetentionPolicy): ErasureRequest {
  return {
    id,
    subject,
    requestedAt: at,
    dueBy: addDays(at, policy.erasureDeadlineDays),
    status: 'pending',
    executedAt: null,
    pseudonym: null,
    erasedCounts: null,
    dissociatedRecords: null,
    attempts: 0,
    lastFailure: null
  };
}

export function recordFailedAttempt(request: ErasureRequest, failure: string): ErasureRequest {
  return { ...request, attempts: request.attempts + 1, lastFailure: failure };
}

export function completeErasure(
  request: ErasureRequest,
  outcome: {
    readonly executedAt: Date;
    readonly pseudonym: string;
    readonly erasedCounts: ErasedCounts;
    readonly dissociatedRecords: number;
  }
): ErasureRequest {
  return {
    ...request,
    subject: null,
    status: 'completed',
    executedAt: outcome.executedAt,
    pseudonym: outcome.pseudonym,
    erasedCounts: outcome.erasedCounts,
    dissociatedRecords: outcome.dissociatedRecords,
    attempts: request.attempts + 1,
    lastFailure: null
  };
}

export function isOverdue(request: ErasureRequest, now: Date): boolean {
  return request.status === 'pending' && now.getTime() > request.dueBy.getTime();
}
