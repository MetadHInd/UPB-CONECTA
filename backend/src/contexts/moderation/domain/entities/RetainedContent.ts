import type { ModerationReason } from '../services/ModerationDecisionPolicy.js';

/**
 * Contenido del foro retenido por la moderación automática (HU-31 criterio
 * 4 y 6): no es visible para la comunidad y espera a un moderador. Guarda la
 * copia completa porque nunca llegó a `forum_posts`; si un humano lo aprueba,
 * se publica desde esta copia.
 */
export interface RetainedContent {
  /** Id que tendría la publicación; el mismo que usa el historial de infracciones (`post:<id>`). */
  readonly id: string;
  readonly kind: 'post';
  readonly topicId: string;
  readonly title: string;
  readonly text: string;
  readonly author: {
    readonly email: string;
    readonly name: string;
    readonly programName: string;
    readonly programId: string | null;
  };
  readonly reason: ModerationReason;
  /** `null` si no hubo puntaje utilizable (servicio caído). */
  readonly score: number | null;
  readonly retainedAt: Date;
}
