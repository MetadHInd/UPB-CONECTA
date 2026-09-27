import type { EndAllSessionsForSubject } from '../../../identity/application/EndAllSessionsForSubject.js';
import type { SessionRevocationPort } from '../../domain/ports/out/SessionRevocationPort.js';

/** Conecta la supresión de datos (HU-48) con el cierre de sesiones de `identity` (HU-45/HU-39). */
export class IdentitySessionRevocation implements SessionRevocationPort {
  constructor(private readonly revoke: EndAllSessionsForSubject) {}

  revokeAll(subject: string): Promise<number> {
    return this.revoke.execute(subject);
  }
}
