/**
 * HU-44, criterio 1: puerto de salida que `AuthenticateStudent` invoca tras
 * cada autenticacion correcta, mismo patron que `AuthenticatedProfileSyncPort`
 * (HU-37) — `identity` declara aqui la forma que necesita, sin importar
 * ningun tipo del dominio de `consent`. El contexto `consent` (mas
 * precisamente, un adaptador en la infraestructura de `identity`, ver
 * `ConsentStatusAdapter`) es quien produce esta respuesta.
 */
export interface PendingConsentDocument {
  readonly documentType: string;
  /** Texto legible para el estudiante (criterio 3: "explica la razon"). */
  readonly explanation: string;
}

export interface ConsentRequirementResult {
  /** true si el estudiante debe (re)aceptar al menos un documento antes de usar la aplicacion. */
  readonly mustConsent: boolean;
  readonly pending: readonly PendingConsentDocument[];
}

export interface ConsentStatusPort {
  getRequirement(studentId: string): Promise<ConsentRequirementResult>;
}
