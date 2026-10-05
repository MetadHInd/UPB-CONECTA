import type { ConsentDocumentType } from '../entities/ConsentRecord.js';
import type { ConsentRequirementReason } from './ConsentPolicy.js';

const DOCUMENT_LABELS: Record<ConsentDocumentType, string> = {
  'privacy-policy': 'la política de tratamiento de datos personales',
  'forum-guidelines': 'las normas de convivencia del foro'
};

/**
 * HU-44, criterio 3: "el sistema ... explica la razón". Un bloqueo no puede
 * ser un booleano mudo — esta funcion pura traduce el motivo tecnico
 * (`ConsentRequirementReason`) al texto que vera el estudiante, distinguiendo
 * "nunca lo acepto" de "se publico una version nueva desde su ultima
 * aceptacion" (criterio 5), que son explicaciones distintas.
 */
export function explainConsentRequirement(documentType: ConsentDocumentType, reason: ConsentRequirementReason): string {
  const label = DOCUMENT_LABELS[documentType];
  return reason === 'nunca-acepto'
    ? `Debes aceptar ${label} antes de continuar.`
    : `Se publicó una nueva versión de ${label}; debes aceptarla de nuevo para continuar.`;
}
