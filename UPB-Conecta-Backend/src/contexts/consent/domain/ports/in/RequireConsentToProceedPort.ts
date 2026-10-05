import type { ConsentDocumentType } from '../../entities/ConsentRecord.js';
import type { ConsentRequirementReason } from '../../services/ConsentPolicy.js';

export interface RequireConsentToProceedQuery {
  readonly studentId: string;
  /** Documentos que exige la operacion que se quiere ejecutar. */
  readonly documentTypes: readonly ConsentDocumentType[];
}

export interface PendingConsentDocument {
  readonly documentType: ConsentDocumentType;
  readonly reasonCode: ConsentRequirementReason;
  /** Texto legible para el estudiante (criterio 3: "explica la razon"). */
  readonly explanation: string;
}

export type ConsentGateDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      /** Explicacion combinada, lista para mostrar. */
      readonly reason: string;
      readonly pending: readonly PendingConsentDocument[];
    };

/**
 * HU-44, criterio 3: punto de enganche que un adaptador de entrada futuro
 * invoca antes de ejecutar una operacion que trata datos personales — mismo
 * rol que `AuthorizeOperation` (HU-46), pero para la dimension de
 * consentimiento vigente en vez de rol.
 */
export interface RequireConsentToProceedPort {
  execute(query: RequireConsentToProceedQuery): Promise<ConsentGateDecision>;
}
