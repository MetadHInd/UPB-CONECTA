/**
 * HU-47, criterio 5: cuanto puede hacer un sujeto de una operacion limitada
 * en una ventana de tiempo. Dato externo (`config/rate-limit-policies.json`),
 * mismo patron que `ProtectedOperationsCatalogPort` (HU-46) y
 * `ProgramCatalogPort` (HU-07) — agregar o ajustar un limite es editar el
 * JSON, no recompilar.
 */
export interface RateLimitPolicyEntry {
  readonly operation: string;
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitPolicyCatalog {
  readonly policies: readonly RateLimitPolicyEntry[];
}

export function policyFor(catalog: RateLimitPolicyCatalog, operation: string): RateLimitPolicyEntry | null {
  return catalog.policies.find((entry) => entry.operation === operation) ?? null;
}
