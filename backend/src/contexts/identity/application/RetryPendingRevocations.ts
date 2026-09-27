import type { PendingRevocationRetryResult } from '../domain/entities/SessionClosureResult.js';
import type { PendingRevocationQueuePort } from '../domain/ports/out/PendingRevocationQueuePort.js';
import type { RemoteSessionClosurePort } from '../domain/ports/out/RemoteSessionClosurePort.js';

/**
 * Reintento de revocaciones pendientes (HU-39, criterio 5), invocado por el
 * cliente cuando recupera conexion. Una entrada sale de la cola cuando el
 * servidor responde, sea que revoco o que rechazo el token (vencido o
 * invalido: la sesion ya no permite renovar y no hay nada mas que hacer).
 * Al primer fallo de red se detiene: el resto seguiria fallando igual y se
 * conserva en cola. La revocacion del servidor es idempotente, asi que una
 * respuesta perdida no causa dano al reintentar.
 */
export class RetryPendingRevocations {
  constructor(
    private readonly dependencies: {
      readonly remote: RemoteSessionClosurePort;
      readonly pending: PendingRevocationQueuePort;
    }
  ) {}

  async execute(): Promise<PendingRevocationRetryResult> {
    const { remote, pending } = this.dependencies;
    const items = await pending.list();
    let completed = 0;
    let rejected = 0;

    for (const [index, item] of items.entries()) {
      let response;
      try {
        response = await remote.close({
          refreshToken: item.refreshToken,
          origin: item.origin,
          ...(item.deviceToken !== undefined ? { deviceToken: item.deviceToken } : {})
        });
      } catch {
        return { completed, rejected, stillPending: items.length - index };
      }
      await pending.remove(item);
      if (response.ok) completed += 1;
      else rejected += 1;
    }

    return { completed, rejected, stillPending: 0 };
  }
}
