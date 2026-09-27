import {
  completeErasure,
  recordFailedAttempt,
  type ErasedCounts,
  type ErasureRequest
} from '../domain/entities/ErasureRequest.js';
import type { PersonalDataArea } from '../domain/entities/PersonalDataArea.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ErasureRequestRepositoryPort } from '../domain/ports/out/ErasureRequestRepositoryPort.js';
import type { IdentifierGeneratorPort } from '../domain/ports/out/IdentifierGeneratorPort.js';
import type { ModerationRecordDissociationPort } from '../domain/ports/out/ModerationRecordDissociationPort.js';
import type { PersonalDataSourcePort } from '../domain/ports/out/PersonalDataSourcePort.js';
import type { SessionRevocationPort } from '../domain/ports/out/SessionRevocationPort.js';
import type { RectificationLogPort } from '../domain/ports/out/RectificationLogPort.js';

export interface ErasureExecutorDependencies {
  readonly sources: readonly PersonalDataSourcePort[];
  readonly rectifications: RectificationLogPort;
  readonly moderation: ModerationRecordDissociationPort;
  readonly sessions: SessionRevocationPort;
  readonly requests: ErasureRequestRepositoryPort;
  readonly ids: IdentifierGeneratorPort;
  readonly clock: ClockPort;
}

/**
 * Ejecuta la supresion de una solicitud (HU-48 criterios 4 y 5). Coordina
 * perfil, preferencias, seguimiento, publicaciones y dispositivo a traves de
 * `PersonalDataSourcePort`, revoca las sesiones del titular (refresh tokens de `identity`) y, solo cuando todo lo anterior termino, disocia el
 * registro de moderacion. Es idempotente: si una fuente falla, la solicitud
 * queda pendiente y el siguiente intento repite todo sin danar lo ya borrado.
 *
 * Se disocia al final y no al principio para que un fallo intermedio no deje
 * un titular con datos vivos pero sin su historial de moderacion ligado.
 */
export class ErasureExecutor {
  constructor(private readonly dependencies: ErasureExecutorDependencies) {}

  async run(request: ErasureRequest): Promise<ErasureRequest> {
    const { sources, rectifications, moderation, sessions, requests, ids, clock } = this.dependencies;
    const subject = request.subject;
    if (subject === null) return request;

    let next: ErasureRequest;
    try {
      // Primero las sesiones: ningún refresh token debe poder renovar la sesión de una cuenta que se está suprimiendo.
      await sessions.revokeAll(subject);
      const counts: Partial<Record<PersonalDataArea, number>> = {};
      for (const source of sources) counts[source.area] = await source.erase(subject);
      await rectifications.deleteBySubject(subject);
      const pseudonym = ids.newPseudonym();
      const dissociatedRecords = await moderation.dissociate(subject, pseudonym);
      const erasedCounts: ErasedCounts = counts;
      next = completeErasure(request, { executedAt: clock.now(), pseudonym, erasedCounts, dissociatedRecords });
    } catch (error) {
      next = recordFailedAttempt(request, error instanceof Error ? error.message : String(error));
    }
    await requests.save(next);
    return next;
  }
}
