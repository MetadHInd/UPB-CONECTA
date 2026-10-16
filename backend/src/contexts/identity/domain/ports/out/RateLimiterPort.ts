/**
 * Limitador de intentos de inicio de sesion (HU-43). Los metodos pueden ser
 * sincronos (adaptador en memoria, un solo proceso) o asincronos (adaptador
 * sobre MongoDB, estado compartido entre las replicas de la API).
 */
export interface RateLimiterPort {
  checkAllowed(accountId: string, origin: string): boolean | Promise<boolean>;
  recordFailure(accountId: string, origin: string): void | Promise<void>;
  recordSuccess(accountId: string, origin: string): void | Promise<void>;
}
