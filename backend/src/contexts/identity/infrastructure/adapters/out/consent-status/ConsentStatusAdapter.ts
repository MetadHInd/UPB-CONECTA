import type { ConsentRequirementResult, ConsentStatusPort } from '../../../../domain/ports/out/ConsentStatusPort.js';
import type { RequireConsentToProceedPort } from '../../../../../consent/domain/ports/in/RequireConsentToProceedPort.js';
import { CONSENT_DOCUMENT_TYPES } from '../../../../../consent/domain/entities/ConsentRecord.js';

/**
 * Implementa el puerto de salida `ConsentStatusPort` de `identity` (criterio
 * 1) llamando al mecanismo de consentimiento de `consent`
 * (`RequireConsentToProceed`, que a su vez usa `GetConsentStatus` — criterios
 * 1, 5 y 6, ya cubiertos). Vive en la infraestructura de `identity`, nunca en
 * su dominio ni en su aplicacion: `AuthenticateStudent` solo conoce
 * `ConsentStatusPort`, nunca un tipo de `consent` — mismo desacople que
 * `IdentityProfileSyncAdapter` (`profile`) en sentido inverso, donde el
 * puerto lo declara `identity` y lo implementa la infraestructura del
 * contexto consumidor.
 *
 * Reutiliza `RequireConsentToProceed` (criterio 3) en vez de reimplementar el
 * mismo recorrido documento-por-documento: asi login (criterio 1) y bloqueo
 * de una operacion (criterio 3) comparten una unica fuente de verdad sobre
 * que esta pendiente y por que, en vez de arriesgarse a que diverjan.
 */
export class ConsentStatusAdapter implements ConsentStatusPort {
  constructor(private readonly gate: RequireConsentToProceedPort) {}

  async getRequirement(studentId: string): Promise<ConsentRequirementResult> {
    const decision = await this.gate.execute({ studentId, documentTypes: CONSENT_DOCUMENT_TYPES });

    if (decision.allowed) {
      return { mustConsent: false, pending: [] };
    }

    return {
      mustConsent: true,
      pending: decision.pending.map((item) => ({
        documentType: item.documentType,
        explanation: item.explanation
      }))
    };
  }
}
