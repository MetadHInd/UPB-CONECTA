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

export interface ConsentRecord {
  readonly studentId: string;
  readonly documentType: ConsentDocumentType;
  readonly version: string;
  readonly acceptedAt: Date;
}
