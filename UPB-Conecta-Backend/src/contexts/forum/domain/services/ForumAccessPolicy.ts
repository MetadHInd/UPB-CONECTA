import type { FacultyProgramResolver } from '../../../targeting/domain/services/FacultyProgramResolver.js';
import { targetingIncludesProgram } from '../../../targeting/domain/services/ProgramTargetingMembership.js';
import { isVerifiedAuthor, type ForumAuthor } from '../entities/ForumAuthor.js';
import { isSanctionActive, type Sanction } from '../entities/Sanction.js';
import type { Topic } from '../entities/Topic.js';

export type TopicAccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'topic-not-found' | 'topic-restricted' };

export type PublicationDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'author-not-verified' | 'topic-not-found' | 'topic-restricted' }
  | { readonly allowed: false; readonly reason: 'sanctioned'; readonly sanctionEndsAt: Date };

/**
 * Politica de autorizacion del foro (HU-30), servicio de dominio puro como
 * `FeedVisibilityPolicy`. Decide en el servidor: ocultar un boton en la
 * interfaz no es control de acceso.
 */
export class ForumAccessPolicy {
  constructor(private readonly faculties: FacultyProgramResolver) {}

  /** Criterio 4: un tema retirado equivale a inexistente; uno restringido exige el programa. */
  checkTopicAccess(topic: Topic | null, author: ForumAuthor): TopicAccessDecision {
    if (topic === null || topic.status !== 'active') return { allowed: false, reason: 'topic-not-found' };
    if (!targetingIncludesProgram(topic.restriction, author.programId, this.faculties)) {
      return { allowed: false, reason: 'topic-restricted' };
    }
    return { allowed: true };
  }

  /**
   * Orden de evaluacion: autor verificado (criterio 2), acceso al tema
   * (criterio 4) y sancion (criterio 6). La restriccion va antes que la
   * sancion para que un intento sobre un tema ajeno quede auditado aunque el
   * estudiante ademas este sancionado.
   */
  decidePublication(input: {
    readonly author: ForumAuthor | null;
    readonly topic: Topic | null;
    readonly sanctions: readonly Sanction[];
    readonly now: Date;
  }): PublicationDecision {
    if (!isVerifiedAuthor(input.author)) return { allowed: false, reason: 'author-not-verified' };

    const access = this.checkTopicAccess(input.topic, input.author);
    if (!access.allowed) return access;

    const active = input.sanctions.filter((sanction) => isSanctionActive(sanction, input.now));
    if (active.length > 0) {
      const sanctionEndsAt = new Date(Math.max(...active.map((sanction) => sanction.endsAt.getTime())));
      return { allowed: false, reason: 'sanctioned', sanctionEndsAt };
    }
    return { allowed: true };
  }
}
