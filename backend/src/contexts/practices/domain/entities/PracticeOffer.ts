import type { ProgramTargeting } from '../../../targeting/domain/value-objects/ProgramTargeting.js';

export enum PracticeModality {
  ON_SITE = 'presencial',
  REMOTE = 'remota',
  HYBRID = 'hibrida'
}

export const PRACTICE_MODALITIES: readonly PracticeModality[] = Object.values(PracticeModality);

/**
 * Oferta de practica (HU-24): extiende la convocatoria (diseno de HU-22,
 * "`OfertaPractica` extiende el agregado Convocatoria"). Lo comun a toda
 * convocatoria (descripcion, programas destinatarios, fecha de cierre y canal
 * de postulacion) vive donde ya vive para las convocatorias ingeridas:
 * registro consolidado, segmentacion y clasificacion. Aqui solo se guarda lo
 * propio de una practica, enlazado por `messageId`.
 */
export interface PracticeOfferDetails {
  /** `representativeMessageId` de la convocatoria que la publica. */
  readonly messageId: string;
  /** `ConvocatoriaId` serializado, para retirarla con `WithdrawConvocatoria`. */
  readonly convocatoriaId: {
    readonly sender: string;
    readonly subject: string;
    readonly firstSentAt: Date;
  };
  readonly company: string;
  readonly requirements: string;
  readonly modality: PracticeModality;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedBy: string;
  readonly updatedAt: Date;
  readonly withdrawnAt: Date | null;
}

/** Oferta completa, validada: lo que el administrador diligencia (criterio 1). */
export interface PracticeOfferData {
  readonly company: string;
  readonly description: string;
  readonly requirements: string;
  readonly modality: PracticeModality;
  readonly targeting: ProgramTargeting;
  readonly dueDate: Date;
  /** URL `http(s)` o correo de postulacion; el correo se guarda como `mailto:`. */
  readonly applicationChannel: string;
}

export type PracticeOfferField = keyof PracticeOfferData;

export const PRACTICE_OFFER_FIELDS: readonly PracticeOfferField[] = [
  'company',
  'description',
  'requirements',
  'modality',
  'targeting',
  'dueDate',
  'applicationChannel'
];

export const PRACTICE_OFFER_LIMITS = { companyMax: 150, descriptionMax: 5000, requirementsMax: 3000 } as const;

/**
 * Asunto de la convocatoria: el que ve el estudiante en el feed. Se fija al
 * publicar porque forma parte de `ConvocatoriaId`; por eso la empresa no se
 * puede editar (ver README, decision 3).
 */
export function practiceOfferSubject(company: string): string {
  return `Oferta de práctica en ${company}`;
}
