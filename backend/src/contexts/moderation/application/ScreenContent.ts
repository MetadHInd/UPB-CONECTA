import { neutralizeHtml } from '../../hardening/domain/services/HtmlEncoding.js';
import type { AutomaticModerationRecordPort } from '../domain/ports/out/AutomaticModerationRecordPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ModerationPort } from '../domain/ports/out/ModerationPort.js';
import type { ModerationRulesRepositoryPort } from '../domain/ports/out/ModerationRulesRepositoryPort.js';
import { BannedTermsDictionary } from '../domain/services/BannedTermsDictionary.js';
import { ModerationDecisionPolicy, type ModerationDecision } from '../domain/services/ModerationDecisionPolicy.js';
import { buildModerationRequest, type ModerationAuthorIdentity } from '../domain/services/ModerationRequest.js';
import type { ModeratedContentKind } from '../domain/value-objects/ModerationDecisionInput.js';
import type { ModerationRules } from '../domain/value-objects/ModerationRules.js';
import type { ModerationThresholds } from '../domain/value-objects/ModerationThresholds.js';
import { scoreWithin } from './ModerationScoring.js';

export interface ModerationPolicyConfig {
  readonly thresholds: ModerationThresholds;
  readonly bannedTerms: readonly string[];
  /** Plazo máximo de espera al servicio externo, por debajo del presupuesto de 3 s (criterio 8). */
  readonly timeoutMs: number;
}

/** Presupuesto total de análisis y decisión (HU-31 criterio 8). */
export const MODERATION_BUDGET_MS = 3000;

export class InvalidModerationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`El plazo de espera al servicio de moderación debe ser un entero positivo menor a ${MODERATION_BUDGET_MS} ms; se recibió ${timeoutMs}.`);
    this.name = 'InvalidModerationTimeoutError';
  }
}

export interface ScreenContentInput {
  readonly title: string;
  readonly text: string;
  readonly author: ModerationAuthorIdentity;
  /** El contenido evaluado. Obligatorio cuando las decisiones se registran (HU-52 criterio 4). */
  readonly content?: { readonly id: string; readonly kind: ModeratedContentKind };
}

/**
 * Moderación automática previa a la publicación (HU-31; RF-50, RF-51).
 * Analiza el texto con el modelo (sin datos del estudiante), aplica el
 * diccionario de vetados y decide con la política de umbrales. Nunca lanza
 * por fallos del servicio: se traducen en "sin puntaje", que la política
 * resuelve reteniendo. Quien lo invoca actúa sobre la decisión (el foro
 * publica, encola o registra la infracción).
 *
 * HU-52: con `rules`, los umbrales y el diccionario se leen en cada
 * evaluación, así que un ajuste del administrador aplica a la siguiente sin
 * redespliegue (criterios 1 y 2); sin él rigen los de `policy`. Con
 * `recording`, toda decisión, también la de publicar, queda registrada con
 * el texto, el puntaje, los umbrales y las expresiones que coincidieron
 * (criterio 4). Si el registro falla, la operación falla: nada se publica
 * sin su registro.
 */
export class ScreenContent {
  private readonly timeoutMs: number;

  constructor(
    private readonly dependencies: {
      readonly moderation: ModerationPort;
      readonly policy: ModerationPolicyConfig;
      readonly rules?: ModerationRulesRepositoryPort;
      readonly recording?: { readonly records: AutomaticModerationRecordPort; readonly clock: ClockPort };
    }
  ) {
    const { timeoutMs } = dependencies.policy;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs >= MODERATION_BUDGET_MS) throw new InvalidModerationTimeoutError(timeoutMs);
    this.timeoutMs = timeoutMs;
  }

  async execute(input: ScreenContentInput): Promise<ModerationDecision> {
    const { recording } = this.dependencies;
    if (recording && !input.content) throw new Error('ScreenContent registra sus decisiones: indica el contenido evaluado.');

    const rules = await this.currentRules();
    const evaluatedText = `${input.title}\n${input.text}`;
    // El diccionario es local y se aplica al texto original, no al enmascarado.
    const matchedTerms = new BannedTermsDictionary(rules.bannedTerms).findMatches(evaluatedText);
    const score = await scoreWithin(this.dependencies.moderation, buildModerationRequest(input), this.timeoutMs);
    const decision = new ModerationDecisionPolicy(rules.thresholds).decide({ score, dictionaryMatch: matchedTerms.length > 0 });

    if (recording && input.content) {
      const decidedAt = recording.clock.now();
      await recording.records.record({
        recordId: `${input.content.kind}:${input.content.id}:${decidedAt.getTime()}`,
        contentId: input.content.id,
        contentKind: input.content.kind,
        evaluatedText: neutralizeHtml(evaluatedText),
        score: decision.score,
        thresholds: { lower: rules.thresholds.lower, upper: rules.thresholds.upper },
        matchedTerms,
        verdict: decision.verdict,
        reason: decision.reason,
        decidedAt,
        resolutions: []
      });
    }
    return decision;
  }

  private async currentRules(): Promise<ModerationRules> {
    const { rules, policy } = this.dependencies;
    return rules ? (await rules.get()).rules : { thresholds: policy.thresholds, bannedTerms: policy.bannedTerms };
  }
}
