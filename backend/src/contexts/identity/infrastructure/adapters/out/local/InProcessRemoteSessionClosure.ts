import type { LogoutResult } from '../../../../domain/entities/SessionResult.js';
import type {
  RemoteSessionClosurePort,
  RemoteSessionClosureRequest
} from '../../../../domain/ports/out/RemoteSessionClosurePort.js';

interface LogoutUseCase {
  execute(input: RemoteSessionClosureRequest): Promise<LogoutResult>;
}

/**
 * Cliente "remoto" que invoca `LogoutSession` en el mismo proceso, con un
 * interruptor de red para simular la desconexion. Sustituye al cliente HTTP
 * (`POST /session/logout`) hasta que exista la capa HTTP.
 */
export class InProcessRemoteSessionClosure implements RemoteSessionClosurePort {
  online = true;

  constructor(private readonly logout: LogoutUseCase) {}

  async close(request: RemoteSessionClosureRequest): Promise<LogoutResult> {
    if (!this.online) throw new Error('Sin conexion con el servidor');
    return this.logout.execute(request);
  }
}
