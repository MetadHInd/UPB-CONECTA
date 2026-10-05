import type { InstitutionalProgramCatalog } from '../../targeting/domain/ports/out/ProgramCatalogPort.js';
import {
  allCommunityTargeting,
  facultyTargeting,
  programTargeting,
  type ProgramTargeting
} from '../../targeting/domain/value-objects/ProgramTargeting.js';
import { InvalidTopicError, topicIdFromName, validateTopicText, type Topic, type TopicStatus } from '../domain/entities/Topic.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { TopicRepositoryPort } from '../domain/ports/out/TopicRepositoryPort.js';

export enum TopicManagementFailureKind {
  INVALID_TOPIC = 'invalid-topic',
  DUPLICATE_TOPIC = 'duplicate-topic',
  TOPIC_NOT_FOUND = 'topic-not-found',
  UNKNOWN_PROGRAM = 'unknown-program',
  UNKNOWN_FACULTY = 'unknown-faculty'
}

export type TopicManagementResult =
  | { readonly ok: true; readonly topic: Topic }
  | { readonly ok: false; readonly error: TopicManagementFailureKind; readonly message: string };

/**
 * Gestion de temas por el administrador (HU-30 criterio 5): crear, editar,
 * restringir, retirar y reactivar son operaciones sobre datos, sin
 * redespliegue. Quien puede invocarlas lo decide un control de acceso
 * administrativo que esta fuera del alcance de esta historia; `performedBy`
 * queda registrado en el tema.
 */
export class ManageTopics {
  constructor(
    private readonly dependencies: {
      readonly topics: TopicRepositoryPort;
      readonly clock: ClockPort;
      /** Para rechazar restricciones a programas o facultades que no existen. */
      readonly catalog: InstitutionalProgramCatalog;
    }
  ) {}

  async create(input: {
    readonly name: string;
    readonly description: string;
    readonly restriction?: ProgramTargeting;
    readonly performedBy: string;
  }): Promise<TopicManagementResult> {
    let text: { name: string; description: string };
    try {
      text = validateTopicText(input.name, input.description);
    } catch (error) {
      return invalid(error);
    }
    const restriction = this.validateRestriction(input.restriction ?? allCommunityTargeting());
    if (!restriction.ok) return restriction;

    const now = this.dependencies.clock.now();
    const topic: Topic = {
      id: topicIdFromName(text.name),
      ...text,
      restriction: restriction.value,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      updatedBy: input.performedBy
    };
    if (topic.id === '') return invalid(new InvalidTopicError('el nombre debe contener letras o numeros'));
    if (!(await this.dependencies.topics.create(topic))) {
      return fail(TopicManagementFailureKind.DUPLICATE_TOPIC, `Ya existe un tema con el identificador "${topic.id}".`);
    }
    return { ok: true, topic };
  }

  async edit(input: {
    readonly topicId: string;
    readonly name?: string;
    readonly description?: string;
    readonly performedBy: string;
  }): Promise<TopicManagementResult> {
    return this.change(input.topicId, input.performedBy, (topic) => {
      const text = validateTopicText(input.name ?? topic.name, input.description ?? topic.description);
      return { ...topic, ...text };
    });
  }

  async restrict(input: {
    readonly topicId: string;
    readonly restriction: ProgramTargeting;
    readonly performedBy: string;
  }): Promise<TopicManagementResult> {
    const restriction = this.validateRestriction(input.restriction);
    if (!restriction.ok) return restriction;
    return this.change(input.topicId, input.performedBy, (topic) => ({ ...topic, restriction: restriction.value }));
  }

  retire(input: { readonly topicId: string; readonly performedBy: string }): Promise<TopicManagementResult> {
    return this.setStatus(input.topicId, 'retired', input.performedBy);
  }

  reactivate(input: { readonly topicId: string; readonly performedBy: string }): Promise<TopicManagementResult> {
    return this.setStatus(input.topicId, 'active', input.performedBy);
  }

  private setStatus(topicId: string, status: TopicStatus, performedBy: string): Promise<TopicManagementResult> {
    return this.change(topicId, performedBy, (topic) => ({ ...topic, status }));
  }

  private async change(
    topicId: string,
    performedBy: string,
    apply: (topic: Topic) => Topic
  ): Promise<TopicManagementResult> {
    const current = await this.dependencies.topics.findById(topicId);
    if (current === null) return fail(TopicManagementFailureKind.TOPIC_NOT_FOUND, `No existe el tema "${topicId}".`);
    let next: Topic;
    try {
      next = { ...apply(current), updatedAt: this.dependencies.clock.now(), updatedBy: performedBy };
    } catch (error) {
      return invalid(error);
    }
    await this.dependencies.topics.update(next);
    return { ok: true, topic: next };
  }

  private validateRestriction(
    restriction: ProgramTargeting
  ): { readonly ok: true; readonly value: ProgramTargeting } | { readonly ok: false; readonly error: TopicManagementFailureKind; readonly message: string } {
    const { catalog } = this.dependencies;
    switch (restriction.kind) {
      case 'all-community':
        return { ok: true, value: allCommunityTargeting() };
      case 'faculty':
        if (!catalog.faculties.some((faculty) => faculty.id === restriction.facultyId)) {
          return fail(TopicManagementFailureKind.UNKNOWN_FACULTY, `La facultad "${restriction.facultyId}" no está en el catálogo.`);
        }
        return { ok: true, value: facultyTargeting(restriction.facultyId) };
      case 'programs': {
        const known = new Set(catalog.programs.map((program) => program.id));
        const unknown = restriction.programIds.filter((id) => !known.has(id));
        if (unknown.length > 0) {
          return fail(TopicManagementFailureKind.UNKNOWN_PROGRAM, `Programas fuera del catálogo: ${unknown.join(', ')}.`);
        }
        return { ok: true, value: programTargeting(restriction.programIds) };
      }
    }
  }
}

function fail(error: TopicManagementFailureKind, message: string) {
  return { ok: false as const, error, message };
}

function invalid(error: unknown): TopicManagementResult {
  if (error instanceof InvalidTopicError) return fail(TopicManagementFailureKind.INVALID_TOPIC, error.message);
  throw error;
}
