/**
 * HU-44 (RF-71, RNF-23, Ley 1581 de 2012): el consentimiento no es un
 * booleano, es un hecho verificable — por eso `ConsentRecord` es inmutable
 * y cada aceptacion se conserva (criterio 5), nunca se sobreescribe.
 *
 * `studentId` es un identificador opaco para este contexto: lo produce el
 * sistema de autenticacion (HU-43), que todavia no existe. Este contexto no
 * necesita saber como se autentico el estudiante, solo que ID lo identifica.
 */
export type ConsentDocumentType = 'privacy-policy' | 'forum-guidelines';

/**
 * HU-44, criterios 1 y 3: todos los documentos que exige el primer ingreso.
 * El texto de la historia es explicito ("la politica de tratamiento de datos
 * y las normas de convivencia del foro"), asi que el punto de enganche de
 * login (`ConsentStatusPort` en `identity`) recorre esta lista completa, no
 * solo `privacy-policy`.
 */
export const CONSENT_DOCUMENT_TYPES: readonly ConsentDocumentType[] = ['privacy-policy', 'forum-guidelines'];

export interface ConsentRecord {
  readonly studentId: string;
  readonly documentType: ConsentDocumentType;
  readonly version: string;
  readonly acceptedAt: Date;
}
