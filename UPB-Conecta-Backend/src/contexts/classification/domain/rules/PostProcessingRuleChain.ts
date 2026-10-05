import type { InstitutionalMessage } from '../../../ingestion/domain/entities/InstitutionalMessage.js';
import type { MessageCategory } from '../value-objects/MessageCategory.js';
import type { PostProcessingRuleData } from './PostProcessingRuleData.js';
import { buildSpecification } from './RuleConditionSpecification.js';
import type { Specification } from './Specification.js';

/**
 * Resultado de evaluar la cadena de reglas sobre un mensaje. `no-rule-applied`
 * significa que ninguna regla activa coincidio: la categoria propuesta por el
 * clasificador queda como definitiva sin marca de regla alguna.
 */
export type PostProcessingOutcome =
  | { readonly kind: 'no-rule-applied' }
  | { readonly kind: 'confirmed'; readonly appliedRuleId: string }
  | { readonly kind: 'corrected'; readonly appliedRuleId: string; readonly category: MessageCategory }
  | { readonly kind: 'discarded'; readonly appliedRuleId: string };

function outcomeFromRule(rule: PostProcessingRuleData): PostProcessingOutcome {
  switch (rule.action.type) {
    case 'confirm':
      return { kind: 'confirmed', appliedRuleId: rule.id };
    case 'correct':
      return { kind: 'corrected', appliedRuleId: rule.id, category: rule.action.category };
    case 'discard':
      return { kind: 'discarded', appliedRuleId: rule.id };
  }
}

/**
 * Un eslabon de la cadena de responsabilidad: si su regla aplica, resuelve y
 * detiene la cadena; si no, delega al siguiente eslabon (o termina en
 * 'no-rule-applied' si es el ultimo).
 */
class PostProcessingRuleChainNode {
  private next: PostProcessingRuleChainNode | null = null;

  constructor(
    private readonly rule: PostProcessingRuleData,
    private readonly specification: Specification<InstitutionalMessage>
  ) {}

  setNext(next: PostProcessingRuleChainNode): void {
    this.next = next;
  }

  handle(message: InstitutionalMessage): PostProcessingOutcome {
    if (this.specification.isSatisfiedBy(message)) {
      return outcomeFromRule(this.rule);
    }
    return this.next ? this.next.handle(message) : { kind: 'no-rule-applied' };
  }
}

/**
 * Ordena las reglas activas por precedencia (RF-13, criterio 4): un numero
 * menor se evalua primero. Ante empate, se desempata por `id` ascendente para
 * que el resultado sea determinista sin importar el orden en que el
 * repositorio las haya devuelto.
 */
function sortByPrecedence(rules: readonly PostProcessingRuleData[]): PostProcessingRuleData[] {
  return [...rules].sort((a, b) => a.precedence - b.precedence || a.id.localeCompare(b.id));
}

export function buildPostProcessingChain(rules: readonly PostProcessingRuleData[]): PostProcessingRuleChainNode | null {
  const nodes = sortByPrecedence(rules.filter((rule) => rule.active)).map(
    (rule) => new PostProcessingRuleChainNode(rule, buildSpecification(rule.condition))
  );

  for (let index = 1; index < nodes.length; index++) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    if (previous && current) {
      previous.setNext(current);
    }
  }

  return nodes[0] ?? null;
}

/**
 * Punto de entrada del posprocesamiento: construye la cadena a partir de las
 * reglas vigentes (leidas en cada ejecucion, nunca cacheadas — criterio 5) y
 * la evalua sobre el mensaje.
 */
export function applyPostProcessingRules(
  rules: readonly PostProcessingRuleData[],
  message: InstitutionalMessage
): PostProcessingOutcome {
  const chain = buildPostProcessingChain(rules);
  return chain ? chain.handle(message) : { kind: 'no-rule-applied' };
}
