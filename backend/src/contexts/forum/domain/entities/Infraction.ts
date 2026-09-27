/**
 * Resultado de moderacion sobre un contenido del foro (HU-35 criterios 1 y 5).
 * `retained`: retenido para revision, sin decision todavia. `blocked`: la
 * moderacion confirmo que viola las normas de convivencia. Solo lo bloqueado
 * computa para sancionar: una sancion por contenido que nadie confirmo no se
 * podria sustentar ante el estudiante.
 */
export enum InfractionOutcome {
  RETAINED = 'retained',
  BLOCKED = 'blocked'
}

export type ModeratedContentKind = 'post' | 'comment';

/**
 * Copia del contenido tal como se modero. Hace falta la copia y no solo el id
 * porque un contenido bloqueado antes de publicarse (HU-31) nunca llega a
 * `forum_posts`: sin ella el historial no mostraria que se bloqueo.
 */
export interface ModeratedContentSnapshot {
  readonly kind: ModeratedContentKind;
  readonly id: string;
  readonly topicId: string;
  readonly title: string | null;
  readonly text: string;
}

export interface Infraction {
  /** Uno por contenido (`kindId`): reintentos del moderador no duplican la infraccion. */
  readonly id: string;
  readonly studentEmail: string;
  readonly content: ModeratedContentSnapshot;
  readonly outcome: InfractionOutcome;
  /** Norma de convivencia incumplida, tal como la explica la moderacion. */
  readonly reason: string;
  /** Quien la detecto: moderacion automatica (HU-31), reportes (HU-34) o un administrador. */
  readonly detectedBy: string;
  readonly occurredAt: Date;
}

export const INFRACTION_LIMITS = { reasonMax: 500, textMax: 5000 } as const;

export function infractionIdFor(content: Pick<ModeratedContentSnapshot, 'kind' | 'id'>): string {
  return `${content.kind}:${content.id}`;
}
