import type { FeedCategoryPort } from '../domain/ports/out/FeedCategoryPort.js';
import type { ConvocatoriaEntry } from '../domain/ports/out/ConvocatoriaRepositoryPort.js';
import { matchesText, orderByDeadline, urgencyOf, type UrgencyLevel } from '../domain/services/FeedQuery.js';
import type { GetStudentFeed } from './GetStudentFeed.js';

export interface QueryStudentFeedInput {
  readonly studentEmail: string;
  /** RF-20: una o varias categorias a la vez; vacio o ausente = todas. */
  readonly categories?: readonly string[] | undefined;
  /** RF-21: texto libre sobre asunto y cuerpo. */
  readonly text?: string | undefined;
  readonly limit?: number | undefined;
}

export interface FeedItem extends ConvocatoriaEntry {
  readonly category: string | null;
  readonly urgency: UrgencyLevel;
}

export type QueryStudentFeedResult =
  | { readonly ok: true; readonly feed: readonly FeedItem[]; readonly incompleteProfile: boolean }
  | { readonly ok: false; readonly error: 'invalid-category'; readonly message: string };

/**
 * Feed del estudiante ordenado por cierre (RF-18), con nivel de urgencia
 * (RF-19), filtro por categorias (RF-20) y busqueda por texto (RF-21). Parte de
 * `GetStudentFeed`, asi que conserva la segmentacion por perfil (RF-17). El
 * limite se aplica al final: filtrar despues de recortar devolveria menos
 * resultados de los que existen.
 */
export class QueryStudentFeed {
  constructor(
    private readonly dependencies: {
      readonly feed: Pick<GetStudentFeed, 'execute'>;
      readonly categories: FeedCategoryPort;
      readonly clock: { now(): Date };
    }
  ) {}

  async execute(input: QueryStudentFeedInput): Promise<QueryStudentFeedResult> {
    const { feed, categories, clock } = this.dependencies;
    const wanted = input.categories ?? [];
    const allowed = categories.allowedCategories();
    const unknown = wanted.filter((category) => !allowed.includes(category));
    if (unknown.length > 0) {
      return { ok: false, error: 'invalid-category', message: `Categoria no valida: ${unknown.join(', ')}.` };
    }

    const base = await feed.execute(input.studentEmail);
    const byMessage = await categories.categoriesFor(
      base.feed.map((entry) => entry.record.representativeMessageId).filter((id): id is string => typeof id === 'string')
    );
    const now = clock.now();

    const items: FeedItem[] = base.feed.map((entry) => ({
      ...entry,
      category: byMessage.get(entry.record.representativeMessageId ?? '') ?? null,
      urgency: urgencyOf(entry.record.dueDate, now)
    }));
    const filtered = items
      .filter((item) => wanted.length === 0 || (item.category !== null && wanted.includes(item.category)))
      .filter((item) => matchesText(item.record, input.text ?? ''));
    const ordered = orderByDeadline(filtered);

    return {
      ok: true,
      feed: input.limit === undefined ? ordered : ordered.slice(0, input.limit),
      incompleteProfile: base.incompleteProfile
    };
  }
}
