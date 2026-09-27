import type { LogoutResult } from '../../entities/SessionResult.js';

export interface RemoteSessionClosureRequest {
  readonly refreshToken: string;
  readonly deviceToken?: string;
  readonly origin: string;
}

/**
 * Llamada al servidor para cerrar la sesion (HU-39, criterios 1, 2 y 6).
 * Devuelve un `LogoutResult` cuando el servidor respondio, y LANZA cuando no
 * hubo respuesta (sin red, tiempo agotado, error 5xx): esa es la senal que
 * `CloseSession` usa para dejar la revocacion pendiente (criterio 5).
 */
export interface RemoteSessionClosurePort {
  close(request: RemoteSessionClosureRequest): Promise<LogoutResult>;
}
