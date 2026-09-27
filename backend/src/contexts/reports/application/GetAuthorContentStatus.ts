import {
  reportCaseIdFor,
  toAuthorStatusView,
  type AuthorContentStatusView,
  type ReportedContentKind
} from '../domain/entities/ContentReportCase.js';
import type { ReportCaseRepositoryPort } from '../domain/ports/out/ReportCaseRepositoryPort.js';

export type AuthorContentStatusResult =
  | { readonly ok: true; readonly status: AuthorContentStatusView | null }
  | { readonly ok: false; readonly error: 'not-author'; readonly message: string };

/**
 * Estado de un contenido propio para su autor (HU-34 criterio 2): solo dice si
 * esta oculto en revision. No expone cuantos reportes, sus causas ni quien
 * reporto. `null` si el contenido nunca fue reportado.
 */
export class GetAuthorContentStatus {
  constructor(private readonly dependencies: { readonly cases: ReportCaseRepositoryPort }) {}

  async execute(input: { readonly authorEmail: string; readonly kind: ReportedContentKind; readonly contentId: string }): Promise<AuthorContentStatusResult> {
    const reportCase = await this.dependencies.cases.findById(reportCaseIdFor({ kind: input.kind, id: input.contentId }));
    if (reportCase === null) return { ok: true, status: null };
    if (reportCase.authorEmail !== input.authorEmail.trim().toLowerCase()) {
      return { ok: false, error: 'not-author', message: 'Solo el autor puede consultar el estado de su contenido.' };
    }
    return { ok: true, status: toAuthorStatusView(reportCase) };
  }
}
