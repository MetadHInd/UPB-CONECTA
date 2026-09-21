/**
 * Specification pattern: separa "¿aplica esto a este candidato?" de lo que
 * ocurre si aplica (esa segunda parte vive en PostProcessingRuleChain).
 */
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}

export class AndSpecification<T> implements Specification<T> {
  constructor(private readonly specifications: readonly Specification<T>[]) {}

  isSatisfiedBy(candidate: T): boolean {
    return this.specifications.every((specification) => specification.isSatisfiedBy(candidate));
  }
}

export class OrSpecification<T> implements Specification<T> {
  constructor(private readonly specifications: readonly Specification<T>[]) {}

  isSatisfiedBy(candidate: T): boolean {
    return this.specifications.some((specification) => specification.isSatisfiedBy(candidate));
  }
}

export class NotSpecification<T> implements Specification<T> {
  constructor(private readonly specification: Specification<T>) {}

  isSatisfiedBy(candidate: T): boolean {
    return !this.specification.isSatisfiedBy(candidate);
  }
}
