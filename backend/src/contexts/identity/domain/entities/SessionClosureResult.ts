import type { SessionFailure } from './SessionResult.js';

/**
 * - `completed`: el servidor revoco el token y el refresh, y dio de baja el dispositivo.
 * - `pending`: no hubo red; la revocacion queda en cola y se reintenta.
 * - `rejected`: el servidor respondio que el token no es valido o ya vencio; no hay nada que reintentar.
 */
export type RemoteRevocationOutcome = 'completed' | 'pending' | 'rejected';

export interface SessionClosureResult {
  /** `false` si la purga local fallo; el cierre remoto se intenta igual. */
  readonly localPurged: boolean;
  readonly remote: RemoteRevocationOutcome;
  readonly rejection?: SessionFailure;
}

export interface PendingRevocationRetryResult {
  readonly completed: number;
  readonly rejected: number;
  /** Siguen en cola porque el servidor aun no responde. */
  readonly stillPending: number;
}
