import { revokeSanction, type SanctionRecord } from '../domain/entities/Sanction.js';
import { sanctionRevokedMessage } from '../domain/services/SanctionMessages.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { SanctionAuditPort } from '../domain/ports/out/SanctionAuditPort.js';
import type { SanctionNotificationPort } from '../domain/ports/out/SanctionNotificationPort.js';
import type { SanctionRepositoryPort } from '../domain/ports/out/SanctionRepositoryPort.js';

export enum SanctionRevocationFailureKind {
  REASON_REQUIRED = 'reason-required',
  SANCTION_NOT_FOUND = 'sanction-not-found',
  ALREADY_REVOKED = 'already-revoked'
}

export type RevokeSanctionResult =
  | { readonly ok: true; readonly sanction: SanctionRecord }
  | { readonly ok: false; readonly error: SanctionRevocationFailureKind; readonly message: string };

/**
 * Revocar una sancion improcedente (HU-35 criterio 6). No se borra: queda en
 * el historial marcada como revocada, con quien y por que, y ademas en la
 * auditoria append-only. Desde ese momento deja de impedir publicar, y la
 * infraccion que la disparo deja de computar (ver `SanctionPolicy`).
 * Operacion de administrador de contenido: `performedBy` lo provee el control
 * de acceso de HU-46, declarado en `config/protected-operations.json`.
 */
export class RevokeSanction {
  constructor(
    private readonly dependencies: {
      readonly sanctions: SanctionRepositoryPort;
      readonly notifications: SanctionNotificationPort;
      readonly audit: SanctionAuditPort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: { readonly sanctionId: string; readonly reason: string; readonly performedBy: string }): Promise<RevokeSanctionResult> {
    const { sanctions, notifications, audit, clock } = this.dependencies;
    const reason = input.reason.trim();
    if (reason === '') {
      return fail(SanctionRevocationFailureKind.REASON_REQUIRED, 'Revocar una sanción exige explicar por qué es improcedente.');
    }

    const current = await sanctions.findById(input.sanctionId);
    if (current === null) return fail(SanctionRevocationFailureKind.SANCTION_NOT_FOUND, `No existe la sanción "${input.sanctionId}".`);
    if (current.revocation !== null) {
      return fail(SanctionRevocationFailureKind.ALREADY_REVOKED, 'La sanción ya estaba revocada.');
    }

    const now = clock.now();
    const revoked = revokeSanction(current, { revokedBy: input.performedBy, reason, revokedAt: now });
    await sanctions.update(revoked);
    await audit.record({
      kind: 'sanction-revoked',
      sanctionId: revoked.id,
      studentEmail: revoked.studentEmail,
      reason,
      performedBy: input.performedBy,
      occurredAt: now
    });
    await notifications.notifyStudent({
      kind: 'sanction-revoked',
      sanctionId: revoked.id,
      studentEmail: revoked.studentEmail,
      message: sanctionRevokedMessage(revoked)
    });
    return { ok: true, sanction: revoked };
  }
}

function fail(error: SanctionRevocationFailureKind, message: string): RevokeSanctionResult {
  return { ok: false, error, message };
}
