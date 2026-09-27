import type { ModerationPort } from '../domain/ports/out/ModerationPort.js';
import { BannedTermsDictionary } from '../domain/services/BannedTermsDictionary.js';
import { ModerationDecisionPolicy, type ModerationDecision } from '../domain/services/ModerationDecisionPolicy.js';
import { buildModerationRequest, type ModerationAuthorIdentity } from '../domain/services/ModerationRequest.js';
import type { ModerationThresholds } from '../domain/value-objects/ModerationThresholds.js';

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
}

/**
 * Moderación automática previa a la publicación (HU-31; RF-50, RF-51).
 * Analiza el texto con el modelo (sin datos del estudiante), aplica el
 * diccionario de vetados y decide con la política de umbrales. Nunca lanza
 * por fallos del servicio: se traducen en "sin puntaje", que la política
 * resuelve reteniendo. No persiste nada; quien lo invoca actúa sobre la
 * decisión (el foro publica, encola o registra la infracción).
 */
export class ScreenContent {
  private readonly policy: ModerationDecisionPolicy;
  private readonly dictionary: BannedTermsDictionary;
  private readonly timeoutMs: number;

  constructor(private readonly dependencies: { readonly moderation: ModerationPort; readonly policy: ModerationPolicyConfig }) {
    const { timeoutMs, thresholds, bannedTerms } = dependencies.policy;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs >= MODERATION_BUDGET_MS) throw new InvalidModerationTimeoutError(timeoutMs);
    this.timeoutMs = timeoutMs;
    this.policy = new ModerationDecisionPolicy(thresholds);
    this.dictionary = new BannedTermsDictionary(bannedTerms);
  }

  async execute(input: ScreenContentInput): Promise<ModerationDecision> {
    const request = buildModerationRequest(input);
    // El diccionario es local y se aplica al texto original, no al enmascarado.
    const dictionaryMatch = this.dictionary.matches(`${input.title}\n${input.text}`);
    const score = await this.score(request);
    return this.policy.decide({ score, dictionaryMatch });
  }

  private async score(request: { readonly text: string }): Promise<number | null> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), this.timeoutMs);
    });
    const analysis = this.dependencies.moderation.analyze(request).then(
      (result) => (typeof result?.score === 'number' ? result.score : null),
      () => null
    );
    try {
      return await Promise.race([analysis, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }
}
