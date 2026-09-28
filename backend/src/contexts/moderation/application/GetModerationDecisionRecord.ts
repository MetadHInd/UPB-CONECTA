import type { AutomaticModerationRecord } from '../domain/entities/AutomaticModerationRecord.js';
import type { AutomaticModerationRecordPort } from '../domain/ports/out/AutomaticModerationRecordPort.js';
import type { ContentModerationLogPort } from '../domain/ports/out/ContentModerationLogPort.js';
import { findNormForCategory, type CommunityNorm, type ModerationFeedbackConfig } from '../domain/value-objects/ModerationFeedbackConfig.js';

/** Lo que sustenta la infracción ante el estudiante que la impugna (HU-52 criterio 6). */
export interface InfractionGrounds {
  readonly category: string;
  /** Norma de convivencia de esa categoría; `null` si la categoría ya no tiene norma configurada. */
  readonly norm: CommunityNorm | null;
  /** Fragmento que motivó la decisión. */
  readonly fragment: string;
  /** Expresiones del diccionario que coincidieron, si fue un bloqueo por diccionario. */
  readonly matchedTerms: readonly string[];
  readonly decidedBy: string;
  readonly source: 'automatic' | 'human-review';
  readonly decidedAt: Date;
}

export interface ModerationDecisionRecordView {
  readonly contentId: string;
  /** Decisiones automáticas con sus resoluciones humanas anexas, la más antigua primero. */
  readonly decisions: readonly AutomaticModerationRecord[];
  /** `null` si el contenido se publicó sin infracción o una persona aprobó lo retenido. */
  readonly grounds: InfractionGrounds | null;
}

/**
 * HU-52 (RF-78), criterios 4 a 6: el registro completo de moderación de un
 * contenido. El administrador llega aquí desde el historial de un estudiante
 * (HU-35, `GetModerationHistory`), que nombra cada contenido retenido o
 * bloqueado, cuando el estudiante impugna la sanción.
 *
 * Los fundamentos salen de la última entrada del registro de HU-32
 * (fragmento, categoría y quién decidió), con la norma de convivencia que
 * corresponde. Operación de `content-admin`.
 */
export class GetModerationDecisionRecord {
  constructor(
    private readonly dependencies: {
      readonly records: AutomaticModerationRecordPort;
      readonly log: ContentModerationLogPort;
      readonly config: ModerationFeedbackConfig;
    }
  ) {}

  async execute(query: { readonly contentId: string }): Promise<ModerationDecisionRecordView | null> {
    const { records, log, config } = this.dependencies;
    const [decisions, entries] = await Promise.all([records.findByContentId(query.contentId), log.findByContentId(query.contentId)]);
    if (decisions.length === 0 && entries.length === 0) return null;

    // La ultima palabra la tiene la ultima entrada: si una persona aprobo lo retenido, ya no hay infraccion.
    const latest = entries[entries.length - 1];
    const infraction = latest !== undefined && latest.verdict !== 'publish' ? latest : undefined;
    const lastDecision = decisions[decisions.length - 1];
    return {
      contentId: query.contentId,
      decisions,
      grounds: infraction
        ? {
            category: infraction.category,
            norm: findNormForCategory(config, infraction.category),
            fragment: infraction.fragment,
            matchedTerms: lastDecision?.matchedTerms ?? [],
            decidedBy: infraction.decidedBy,
            source: infraction.source,
            decidedAt: infraction.occurredAt
          }
        : null
    };
  }
}
