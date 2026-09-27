import type { SessionClosureResult } from '../domain/entities/SessionClosureResult.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { LOCAL_CONTENT_KINDS, type LocalDataPurgePort } from '../domain/ports/out/LocalDataPurgePort.js';
import type { PendingRevocationQueuePort } from '../domain/ports/out/PendingRevocationQueuePort.js';
import type { RemoteSessionClosurePort } from '../domain/ports/out/RemoteSessionClosurePort.js';

export interface CloseSessionInput {
  readonly refreshToken: string;
  readonly deviceToken?: string;
  readonly origin: string;
}

/**
 * Cierre de sesion del estudiante (HU-39, RF-64/72/26, RNF-17): un caso de
 * uso de dominio con tres efectos coordinados, no una accion de interfaz.
 *
 * El orden importa. Primero la purga local, porque es lo unico que no
 * depende de la red y lo que protege a quien deja un dispositivo compartido:
 * si la revocacion remota se colgara o fallara, el contenido ya no esta.
 * Despues la revocacion remota (token de acceso, refresh token y dispositivo
 * en una sola llamada); si no hay respuesta, queda en cola y
 * `RetryPendingRevocations` la reintenta al recuperar conexion (criterio 5).
 * Un fallo de la purga no impide intentar la revocacion.
 */
export class CloseSession {
  constructor(
    private readonly dependencies: {
      readonly localData: LocalDataPurgePort;
      readonly remote: RemoteSessionClosurePort;
      readonly pending: PendingRevocationQueuePort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: CloseSessionInput): Promise<SessionClosureResult> {
    const { localData, remote, pending, clock } = this.dependencies;

    const localPurged = await localData.purge(LOCAL_CONTENT_KINDS).then(
      () => true,
      () => false
    );

    const request = {
      refreshToken: input.refreshToken,
      origin: input.origin,
      ...(input.deviceToken !== undefined ? { deviceToken: input.deviceToken } : {})
    };

    let response;
    try {
      response = await remote.close(request);
    } catch {
      await pending.enqueue({ ...request, requestedAt: clock.now() });
      return { localPurged, remote: 'pending' };
    }

    if (response.ok) return { localPurged, remote: 'completed' };
    return { localPurged, remote: 'rejected', rejection: response };
  }
}
