import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ModerationRulesAuditPort, ModerationRulesChange } from '../domain/ports/out/ModerationRulesAuditPort.js';
import type { ModerationRulesRepositoryPort, StoredModerationRules } from '../domain/ports/out/ModerationRulesRepositoryPort.js';
import { BANNED_TERM_MAX_LENGTH, sameBannedTerm, tidyBannedTerm } from '../domain/value-objects/ModerationRules.js';
import { InvalidModerationThresholdsError, ModerationThresholds } from '../domain/value-objects/ModerationThresholds.js';

export type ModerationRulesFailure = {
  readonly ok: false;
  readonly error: 'invalid-thresholds' | 'invalid-term' | 'term-already-banned' | 'term-not-banned';
  readonly message: string;
};

export type ModerationRulesResult = { readonly ok: true; readonly changed: boolean; readonly rules: StoredModerationRules } | ModerationRulesFailure;

/**
 * HU-52 (RF-77), criterios 1 a 3: el administrador ajusta los umbrales de
 * severidad y el diccionario de expresiones vetadas sin intervención del
 * equipo de desarrollo. `ScreenContent` lee las reglas en cada evaluación: el
 * cambio aplica a la siguiente, sin redespliegue, y no reevalúa lo ya
 * decidido, que quedó registrado con las reglas de su momento.
 *
 * Cada cambio real queda auditado con el valor anterior, el nuevo, el
 * administrador y la marca de tiempo. Un ajuste que no cambia nada no
 * escribe ni audita. Operación de `content-admin`, declarada en
 * `config/protected-operations.json`; `performedBy` es el sujeto de la sesión.
 */
export class ManageModerationRules {
  constructor(
    private readonly dependencies: {
      readonly rules: ModerationRulesRepositoryPort;
      readonly audit: ModerationRulesAuditPort;
      readonly clock: ClockPort;
    }
  ) {}

  async get(): Promise<StoredModerationRules> {
    return this.dependencies.rules.get();
  }

  /** Historial de cambios de reglas, el más reciente primero (criterio 3). */
  async history(): Promise<readonly ModerationRulesChange[]> {
    return this.dependencies.audit.findAll();
  }

  async updateThresholds(input: { readonly lower?: number; readonly upper?: number; readonly performedBy: string }): Promise<ModerationRulesResult> {
    const current = await this.dependencies.rules.get();
    const previous = { lower: current.rules.thresholds.lower, upper: current.rules.thresholds.upper };
    let next: ModerationThresholds;
    try {
      next = ModerationThresholds.of(input.lower ?? previous.lower, input.upper ?? previous.upper);
    } catch (error) {
      if (error instanceof InvalidModerationThresholdsError) return { ok: false, error: 'invalid-thresholds', message: error.message };
      throw error;
    }
    if (next.lower === previous.lower && next.upper === previous.upper) return { ok: true, changed: false, rules: current };

    return this.apply({ ...current.rules, thresholds: next }, input.performedBy, (occurredAt) => ({
      kind: 'thresholds-changed',
      previous,
      next: { lower: next.lower, upper: next.upper },
      performedBy: input.performedBy,
      occurredAt
    }));
  }

  async addBannedTerm(input: { readonly term: string; readonly performedBy: string }): Promise<ModerationRulesResult> {
    const term = tidyBannedTerm(typeof input.term === 'string' ? input.term : '');
    if (term === '' || term.length > BANNED_TERM_MAX_LENGTH) {
      return { ok: false, error: 'invalid-term', message: `La expresión debe tener entre 1 y ${BANNED_TERM_MAX_LENGTH} caracteres.` };
    }
    const current = await this.dependencies.rules.get();
    if (current.rules.bannedTerms.some((banned) => sameBannedTerm(banned, term))) {
      return { ok: false, error: 'term-already-banned', message: `"${term}" ya está en el diccionario.` };
    }
    return this.apply({ ...current.rules, bannedTerms: [...current.rules.bannedTerms, term] }, input.performedBy, (occurredAt) => ({
      kind: 'banned-term-added',
      term,
      performedBy: input.performedBy,
      occurredAt
    }));
  }

  async removeBannedTerm(input: { readonly term: string; readonly performedBy: string }): Promise<ModerationRulesResult> {
    const current = await this.dependencies.rules.get();
    const existing = current.rules.bannedTerms.find((banned) => sameBannedTerm(banned, input.term));
    if (existing === undefined) return { ok: false, error: 'term-not-banned', message: `"${tidyBannedTerm(input.term)}" no está en el diccionario.` };
    return this.apply(
      { ...current.rules, bannedTerms: current.rules.bannedTerms.filter((banned) => banned !== existing) },
      input.performedBy,
      (occurredAt) => ({ kind: 'banned-term-removed', term: existing, performedBy: input.performedBy, occurredAt })
    );
  }

  private async apply(
    rules: StoredModerationRules['rules'],
    performedBy: string,
    change: (occurredAt: Date) => ModerationRulesChange
  ): Promise<ModerationRulesResult> {
    const now = this.dependencies.clock.now();
    await this.dependencies.rules.save(rules, { updatedBy: performedBy, updatedAt: now });
    await this.dependencies.audit.record(change(now));
    return { ok: true, changed: true, rules: { rules, updatedBy: performedBy, updatedAt: now } };
  }
}
