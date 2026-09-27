import { SanctionLevel, type SanctionRecord } from '../entities/Sanction.js';
import { sanctionLevelLabel } from './SanctionPolicy.js';

const SANCTION_DATE_FORMAT = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Bogota'
});

const DAY_MS = 86_400_000;

/** Fecha de fin en hora de Colombia, la misma que se informa al rechazar (HU-30 criterio 6, HU-35 criterio 3). */
export function formatSanctionEnd(date: Date): string {
  return `${SANCTION_DATE_FORMAT.format(date)} (hora de Colombia)`;
}

export function sanctionDurationText(sanction: Pick<SanctionRecord, 'level' | 'startsAt' | 'endsAt'>): string | null {
  if (sanction.level === SanctionLevel.WARNING) return null;
  const days = Math.round((sanction.endsAt.getTime() - sanction.startsAt.getTime()) / DAY_MS);
  return days === 1 ? '1 día' : `${days} días`;
}

/** Criterio 2: el estudiante recibe el motivo y la duracion. */
export function sanctionImposedMessage(sanction: SanctionRecord): string {
  const label = sanctionLevelLabel(sanction.level);
  if (sanction.level === SanctionLevel.WARNING) {
    return `${label} en el foro: aún puedes publicar, pero nuevas infracciones llevarán a una suspensión. Motivo: ${sanction.reason}`;
  }
  return (
    `${label} en el foro por ${sanctionDurationText(sanction)}, hasta el ${formatSanctionEnd(sanction.endsAt)}. ` +
    `Motivo: ${sanction.reason}`
  );
}

export function sanctionRevokedMessage(sanction: SanctionRecord): string {
  return `Se revocó la sanción "${sanctionLevelLabel(sanction.level)}" del foro. Si estaba vigente, ya puedes volver a publicar.`;
}
