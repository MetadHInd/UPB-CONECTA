import type { InstitutionalMessage } from '../../../ingestion/domain/entities/InstitutionalMessage.js';
import type { RuleConditionData } from './PostProcessingRuleData.js';
import { AndSpecification, NotSpecification, OrSpecification, type Specification } from './Specification.js';

/**
 * Compila un patron de texto configurado por el administrador a una RegExp
 * insensible a mayusculas. Un patron invalido no debe tumbar la clasificacion
 * de todo el mensaje: la especificacion resultante simplemente no coincide
 * nunca, como si la regla no existiera.
 */
function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

class SenderMatchesSpecification implements Specification<InstitutionalMessage> {
  private readonly regex: RegExp | null;

  constructor(pattern: string) {
    this.regex = compilePattern(pattern);
  }

  isSatisfiedBy(message: InstitutionalMessage): boolean {
    return this.regex !== null && this.regex.test(message.sender);
  }
}

class SubjectMatchesSpecification implements Specification<InstitutionalMessage> {
  private readonly regex: RegExp | null;

  constructor(pattern: string) {
    this.regex = compilePattern(pattern);
  }

  isSatisfiedBy(message: InstitutionalMessage): boolean {
    return this.regex !== null && this.regex.test(message.subject);
  }
}

export function buildSpecification(condition: RuleConditionData): Specification<InstitutionalMessage> {
  switch (condition.type) {
    case 'sender-matches':
      return new SenderMatchesSpecification(condition.pattern);
    case 'subject-matches':
      return new SubjectMatchesSpecification(condition.pattern);
    case 'and':
      return new AndSpecification(condition.conditions.map(buildSpecification));
    case 'or':
      return new OrSpecification(condition.conditions.map(buildSpecification));
    case 'not':
      return new NotSpecification(buildSpecification(condition.condition));
  }
}
