import type { SanctionLevel } from '../../entities/Sanction.js';

export interface SanctionImposedNotice {
  readonly kind: 'sanction-imposed';
  readonly sanctionId: string;
  readonly studentEmail: string;
  readonly level: SanctionLevel;
  /** Motivo: incluye la norma incumplida y cuantas infracciones computaron. */
  readonly reason: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** Duracion legible ("7 días"); `null` en una advertencia, que no suspende. */
  readonly durationText: string | null;
  readonly message: string;
}

export interface SanctionRevokedNotice {
  readonly kind: 'sanction-revoked';
  readonly sanctionId: string;
  readonly studentEmail: string;
  readonly message: string;
}

export type SanctionNotice = SanctionImposedNotice | SanctionRevokedNotice;

/**
 * Avisos de sancion (HU-35 criterio 2). Hoy no existe un canal real de avisos
 * a administradores ni un push del foro (mismo gap que `AdminAlertPort` de
 * HU-10): el adaptador de produccion deja cada aviso en una bandeja
 * persistente que ese canal consumira.
 */
export interface SanctionNotificationPort {
  notifyStudent(notice: SanctionNotice): Promise<void>;
  notifyAdministrators(notice: SanctionNotice): Promise<void>;
}
