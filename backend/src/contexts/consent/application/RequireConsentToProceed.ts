import type { GetConsentStatusPort } from '../domain/ports/in/GetConsentStatusPort.js';
import type {
  ConsentGateDecision,
  PendingConsentDocument,
  RequireConsentToProceedPort,
  RequireConsentToProceedQuery
} from '../domain/ports/in/RequireConsentToProceedPort.js';
import { currentVersionOf, type PublishedConsentVersions } from '../domain/ports/out/PublishedConsentVersionsPort.js';
import { explainConsentRequirement } from '../domain/services/explainConsentRequirement.js';

export interface RequireConsentToProceedDependencies {
  readonly getConsentStatus: GetConsentStatusPort;
  readonly versions: PublishedConsentVersions;
}

/**
 * El catalogo de versiones publicadas no declara version para un documento
 * que la operacion exige: es un error de configuracion, no "el estudiante
 * puede continuar". Mismo espiritu que `UnknownProtectedOperationError`
 * (HU-46): fallar explicito en vez de abrir en silencio.
 */
export class MissingPublishedConsentVersionError extends Error {
  constructor(documentType: string) {
    super(`No hay version publicada configurada para el documento de consentimiento '${documentType}'.`);
    this.name = 'MissingPublishedConsentVersionError';
  }
}

/**
 * HU-44, criterio 3: "sin aceptar, no se permite el uso de funciones que
 * tratan datos personales, y el sistema explica la razon". Este caso de uso
 * es ese punto de enganche — deliberadamente separado de `AuthorizeOperation`
 * (HU-46, control de acceso por rol) en vez de agregarle una dimension mas:
 * ambos rechazos son legalmente distintos (Ley 1581 de 2012 vs control de
 * acceso interno) y auditar "falta de consentimiento" bajo el mismo evento
 * que "rol insuficiente" oscurecería cual de las dos obligaciones se
 * incumplió. Reutiliza `GetConsentStatus` (criterios 1/5/6, ya cubierto) en
 * vez de reimplementar la evaluacion de vigencia.
 */
export class RequireConsentToProceed implements RequireConsentToProceedPort {
  constructor(private readonly deps: RequireConsentToProceedDependencies) {}

  async execute(query: RequireConsentToProceedQuery): Promise<ConsentGateDecision> {
    const pending: PendingConsentDocument[] = [];

    for (const documentType of query.documentTypes) {
      const currentVersion = currentVersionOf(this.deps.versions, documentType);
      if (currentVersion === null) {
        throw new MissingPublishedConsentVersionError(documentType);
      }

      const { status } = await this.deps.getConsentStatus.execute({
        studentId: query.studentId,
        documentType,
        currentVersion
      });

      if (status.kind === 'requiere-consentimiento') {
        pending.push({
          documentType,
          reasonCode: status.reason,
          explanation: explainConsentRequirement(documentType, status.reason)
        });
      }
    }

    if (pending.length === 0) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: pending.map((item) => item.explanation).join(' '),
      pending
    };
  }
}
