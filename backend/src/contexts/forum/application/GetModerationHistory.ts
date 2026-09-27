import { normalizeForumEmail } from '../domain/entities/ForumAuthor.js';
import type { Infraction } from '../domain/entities/Infraction.js';
import { activeSanctionEnd, sanctionStatus, type SanctionRecord, type SanctionStatus } from '../domain/entities/Sanction.js';
import { SanctionPolicy, type SanctionStanding } from '../domain/services/SanctionPolicy.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { InfractionRepositoryPort } from '../domain/ports/out/InfractionRepositoryPort.js';
import type { SanctionRepositoryPort } from '../domain/ports/out/SanctionRepositoryPort.js';
import type { SanctionThresholdsRepositoryPort } from '../domain/ports/out/SanctionThresholdsRepositoryPort.js';

export interface ModeratedContentEntry extends Infraction {
  /** Si hoy cuenta para la gradualidad (bloqueado, dentro de la ventana y no anulado por una revocacion). */
  readonly computable: boolean;
}

export interface SanctionEntry extends SanctionRecord {
  readonly status: SanctionStatus;
}

export interface ModerationHistory {
  readonly studentEmail: string;
  /** Contenidos retenidos y bloqueados, mas reciente primero (criterio 5). */
  readonly contents: readonly ModeratedContentEntry[];
  /** Sanciones con fecha, motivo y estado, incluidas las revocadas (criterio 5). */
  readonly sanctions: readonly SanctionEntry[];
  readonly computableInfractions: number;
  readonly standing: SanctionStanding;
  /** Fin de la suspension vigente; `null` si hoy puede publicar. */
  readonly suspendedUntil: Date | null;
}

/**
 * Historial de moderacion de un estudiante (HU-35 criterio 5). Es lo que
 * sustenta una sancion ante el estudiante: que contenidos, cuando, por que y
 * con que umbrales. Solo lectura. Operacion de administrador de contenido:
 * declarada en `config/protected-operations.json`.
 */
export class GetModerationHistory {
  constructor(
    private readonly dependencies: {
      readonly infractions: InfractionRepositoryPort;
      readonly sanctions: SanctionRepositoryPort;
      readonly thresholds: SanctionThresholdsRepositoryPort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: { readonly studentEmail: string }): Promise<ModerationHistory> {
    const email = normalizeForumEmail(input.studentEmail);
    const now = this.dependencies.clock.now();
    const [infractions, sanctions, stored] = await Promise.all([
      this.dependencies.infractions.findByStudent(email),
      this.dependencies.sanctions.findSanctions(email),
      this.dependencies.thresholds.get()
    ]);

    const policy = new SanctionPolicy(stored.thresholds);
    const computable = new Set(policy.computableInfractions({ infractions, sanctions, now }).map((infraction) => infraction.id));

    return {
      studentEmail: email,
      contents: infractions.map((infraction) => ({ ...infraction, computable: computable.has(infraction.id) })),
      sanctions: sanctions.map((sanction) => ({ ...sanction, status: sanctionStatus(sanction, now) })),
      computableInfractions: computable.size,
      standing: policy.standingFor(computable.size),
      suspendedUntil: activeSanctionEnd(sanctions, now)
    };
  }
}
