import { InfractionOutcome, type Infraction } from '../entities/Infraction.js';
import { SanctionLevel, type SanctionRecord } from '../entities/Sanction.js';
import type { SanctionThresholds } from '../value-objects/SanctionThresholds.js';

/** Escalon del estudiante segun sus infracciones computables. */
export type SanctionStanding = 'none' | SanctionLevel;

/**
 * Transiciones explicitas (diseno de HU-35). Cada nueva infraccion computable
 * sube el conteo en uno; se sanciona solo al cambiar de escalon, o en cada
 * reincidencia una vez alcanzado el ultimo:
 *
 *   none ──(conteo = advertencia)──────────▶ warning
 *   warning ──(conteo = suspension temporal)──▶ temporary-suspension
 *   temporary-suspension ──(conteo = prolongada)──▶ extended-suspension
 *   extended-suspension ──(cada infraccion mas)───▶ extended-suspension
 *
 * Entre dos umbrales no hay sancion nueva: el estudiante ya recibio la del
 * escalon en que esta. Si el administrador baja los umbrales, una infraccion
 * puede saltar mas de un escalon: se aplica el alcanzado, no el siguiente.
 */
export function transition(previous: SanctionStanding, current: SanctionStanding): SanctionLevel | null {
  if (current === 'none') return null;
  if (current !== previous) return current;
  return current === SanctionLevel.EXTENDED_SUSPENSION ? current : null;
}

export interface SanctionDecision {
  readonly level: SanctionLevel;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly infractionCount: number;
  readonly reason: string;
}

const LEVEL_LABELS: Readonly<Record<SanctionLevel, string>> = {
  [SanctionLevel.WARNING]: 'Advertencia',
  [SanctionLevel.TEMPORARY_SUSPENSION]: 'Suspensión temporal de la facultad de publicar',
  [SanctionLevel.EXTENDED_SUSPENSION]: 'Suspensión prolongada de la facultad de publicar'
};

export function sanctionLevelLabel(level: SanctionLevel): string {
  return LEVEL_LABELS[level];
}

/**
 * Politica de sanciones graduales (HU-35), servicio de dominio puro como
 * `ForumAccessPolicy`: recibe el historial y los umbrales, no consulta nada.
 */
export class SanctionPolicy {
  constructor(private readonly thresholds: SanctionThresholds) {}

  standingFor(count: number): SanctionStanding {
    const t = this.thresholds.values;
    if (count >= t.extendedSuspensionAt) return SanctionLevel.EXTENDED_SUSPENSION;
    if (count >= t.temporarySuspensionAt) return SanctionLevel.TEMPORARY_SUSPENSION;
    if (count >= t.warningAt) return SanctionLevel.WARNING;
    return 'none';
  }

  /**
   * Computan las infracciones bloqueadas dentro de la ventana, salvo la que
   * disparo una sancion revocada: si el administrador juzgo improcedente la
   * sancion, la evidencia que la sostuvo no puede empujar la siguiente.
   */
  computableInfractions(input: {
    readonly infractions: readonly Infraction[];
    readonly sanctions: readonly SanctionRecord[];
    readonly now: Date;
  }): readonly Infraction[] {
    const annulled = new Set(
      input.sanctions.filter((sanction) => sanction.revocation !== null).map((sanction) => sanction.triggeredByInfractionId)
    );
    const since = input.now.getTime() - this.thresholds.countingWindowMs;
    return input.infractions.filter(
      (infraction) =>
        infraction.outcome === InfractionOutcome.BLOCKED &&
        !annulled.has(infraction.id) &&
        infraction.occurredAt.getTime() > since &&
        infraction.occurredAt.getTime() <= input.now.getTime()
    );
  }

  /**
   * Criterio 1: decide si `trigger`, ya incluida en `infractions`, hace pasar
   * al estudiante de escalon. `null` si no corresponde sancion.
   */
  decide(input: {
    readonly trigger: Infraction;
    readonly infractions: readonly Infraction[];
    readonly sanctions: readonly SanctionRecord[];
    readonly now: Date;
  }): SanctionDecision | null {
    const computable = this.computableInfractions(input);
    if (!computable.some((infraction) => infraction.id === input.trigger.id)) return null;

    const count = computable.length;
    const level = transition(this.standingFor(count - 1), this.standingFor(count));
    if (level === null) return null;

    const t = this.thresholds.values;
    const durationMs =
      level === SanctionLevel.WARNING
        ? 0
        : level === SanctionLevel.TEMPORARY_SUSPENSION
          ? this.thresholds.temporarySuspensionMs
          : this.thresholds.extendedSuspensionMs;

    return {
      level,
      startsAt: input.now,
      endsAt: new Date(input.now.getTime() + durationMs),
      infractionCount: count,
      reason:
        `${sanctionLevelLabel(level)} por ${count} ${count === 1 ? 'infracción' : 'infracciones'} a las normas de convivencia ` +
        `en los últimos ${t.countingWindowDays} días. Última infracción: ${input.trigger.reason}`
    };
  }
}
