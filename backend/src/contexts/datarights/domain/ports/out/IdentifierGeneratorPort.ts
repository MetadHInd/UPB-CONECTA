export interface IdentifierGeneratorPort {
  /** Identificador de una solicitud de supresion. */
  newRequestId(): string;
  /**
   * Seudonimo para disociar el registro de moderacion (criterio 5). Debe ser
   * aleatorio y no derivarse del titular: si se pudiera recalcular desde el
   * correo, la disociacion seria reversible.
   */
  newPseudonym(): string;
}
