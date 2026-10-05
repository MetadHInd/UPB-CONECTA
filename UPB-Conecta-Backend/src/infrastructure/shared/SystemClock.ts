/**
 * Reloj del sistema compartido por la raiz de composicion HTTP
 * (`src/http-server.ts`). Cada contexto (`identity`, `profile`, `forum`,
 * `consent`) declara su propio `ClockPort` para no depender de otro —
 * mismo patron que ya usan `main.ts` (`SystemClock` de `ingestion`) y
 * `notifications` (su propio `SystemClock`) — pero los cuatro puertos
 * exigen exactamente la misma forma (`now(): Date`), asi que esta unica
 * clase los satisface a todos por tipado estructural sin que la raiz de
 * composicion tenga que instanciar cuatro relojes idénticos.
 */
export class SystemClock {
  now(): Date {
    return new Date();
  }
}
