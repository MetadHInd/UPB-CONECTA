/**
 * Sancion sobre la participacion en el foro. HU-30 solo la consultaba
 * (criterio 6); HU-35 la impone por historial de infracciones y permite
 * revocarla. Intervalo semiabierto: vigente desde `startsAt` inclusive hasta
 * `endsAt` exclusive, salvo que se haya revocado antes (`revokedAt`).
 *
 * La vigencia se decide aqui, en el dominio, comparando con el reloj: por eso
 * al vencer el plazo la facultad de publicar se restablece sola, sin ningun
 * proceso que "levante" la sancion (HU-35 criterio 4).
 */
export interface Sanction {
  readonly startsAt: Date;
  readonly endsAt: Date;
  /** Desde cuando deja de aplicar por revocacion (HU-35 criterio 6); `null` o ausente si sigue en pie. */
  readonly revokedAt?: Date | null;
}

export function isSanctionActive(sanction: Sanction, now: Date): boolean {
  const revoked = sanction.revokedAt != null && sanction.revokedAt.getTime() <= now.getTime();
  return !revoked && sanction.startsAt.getTime() <= now.getTime() && now.getTime() < sanction.endsAt.getTime();
}

/**
 * Fin de la restriccion vigente: con varias sanciones activas, la que termina
 * mas tarde. `null` si no hay ninguna. Publicar y comentar (HU-33) deben
 * consultar esta misma funcion para rechazar con la misma fecha.
 */
export function activeSanctionEnd(sanctions: readonly Sanction[], now: Date): Date | null {
  const active = sanctions.filter((sanction) => isSanctionActive(sanction, now));
  if (active.length === 0) return null;
  return new Date(Math.max(...active.map((sanction) => sanction.endsAt.getTime())));
}

/**
 * Niveles graduales (HU-35 criterio 1), de menor a mayor. La advertencia no
 * suspende: se registra con un intervalo vacio (`endsAt = startsAt`), asi que
 * `isSanctionActive` nunca la considera vigente y queda solo en el historial.
 */
export enum SanctionLevel {
  WARNING = 'warning',
  TEMPORARY_SUSPENSION = 'temporary-suspension',
  EXTENDED_SUSPENSION = 'extended-suspension'
}

export interface SanctionRevocation {
  /** Administrador que la revoco (criterio 6); lo provee el control de acceso (HU-46). */
  readonly revokedBy: string;
  readonly reason: string;
  readonly revokedAt: Date;
}

/**
 * Sancion impuesta por `SanctionPolicy`. Guarda con que infraccion y con
 * cuantas infracciones computables se impuso: el historial es lo que la hace
 * defendible ante el estudiante (diseno de HU-35).
 */
export interface SanctionRecord extends Sanction {
  readonly id: string;
  readonly studentEmail: string;
  readonly level: SanctionLevel;
  readonly reason: string;
  /** Infracciones computables al imponerla, incluida la que la disparo. */
  readonly infractionCount: number;
  readonly triggeredByInfractionId: string;
  readonly imposedAt: Date;
  readonly revocation: SanctionRevocation | null;
}

export type SanctionStatus = 'active' | 'served' | 'revoked' | 'warning';

/** Estado para el historial (criterio 5): la advertencia no es una suspension. */
export function sanctionStatus(sanction: SanctionRecord, now: Date): SanctionStatus {
  if (sanction.revocation !== null) return 'revoked';
  if (sanction.level === SanctionLevel.WARNING) return 'warning';
  return isSanctionActive(sanction, now) ? 'active' : 'served';
}

export function revokeSanction(sanction: SanctionRecord, revocation: SanctionRevocation): SanctionRecord {
  return { ...sanction, revocation, revokedAt: revocation.revokedAt };
}
