import { neutralizeHtml } from '../../hardening/domain/services/HtmlEncoding.js';
import type { PublishConvocatoria } from '../../ingestion/application/PublishConvocatoria.js';
import { MessageCategory } from '../../classification/domain/value-objects/MessageCategory.js';
import type { InstitutionalProgramCatalog } from '../../targeting/domain/ports/out/ProgramCatalogPort.js';
import { practiceOfferSubject, type PracticeOfferDetails } from '../domain/entities/PracticeOffer.js';
import { validateNewPracticeOffer } from '../domain/services/PracticeOfferValidation.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { PracticeOfferRepositoryPort } from '../domain/ports/out/PracticeOfferRepositoryPort.js';
import { invalidOffer, type PracticeOfferFailure } from './PracticeOfferResults.js';

export type PublishPracticeOfferResult = { readonly ok: true; readonly offer: PracticeOfferDetails } | PracticeOfferFailure;

/**
 * Carga manual de una oferta de practica (HU-24 criterios 1 a 4). Valida en
 * servidor (criterio 3) y publica a traves de `PublishConvocatoria` (HU-50):
 * el diseno de la historia pide que el backoffice sea driving adapter sobre
 * ese caso de uso, sin ruta de escritura alterna. Por eso la oferta manual
 * queda en los mismos repositorios que una ingerida, con categoria
 * `practica`, y entra al mismo feed segmentado, aviso de publicacion y
 * auditoria (criterios 2 y 4).
 *
 * Operacion de administrador de contenido: declarada en
 * `config/protected-operations.json`; `publishedBy` lo provee ese control.
 */
export class PublishPracticeOffer {
  constructor(
    private readonly dependencies: {
      readonly publishConvocatoria: PublishConvocatoria;
      readonly offers: PracticeOfferRepositoryPort;
      readonly catalog: InstitutionalProgramCatalog;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: { readonly form: Readonly<Record<string, unknown>>; readonly publishedBy: string }): Promise<PublishPracticeOfferResult> {
    const { publishConvocatoria, offers, catalog, clock } = this.dependencies;
    const validation = validateNewPracticeOffer(input.form, { catalog, now: clock.now() });
    if (!validation.ok) return invalidOffer(validation.issues);
    const data = validation.value;

    // HU-47, criterio 7: el texto libre se neutraliza una vez, al entrar.
    const company = neutralizeHtml(data.company);
    const published = await publishConvocatoria.execute({
      sender: input.publishedBy,
      subject: practiceOfferSubject(company),
      body: neutralizeHtml(data.description),
      dueDate: { kind: 'con-fecha', date: data.dueDate },
      applicationLink: data.applicationChannel,
      category: MessageCategory.PRACTICA,
      targeting: data.targeting,
      publishedBy: input.publishedBy
    });

    const offer: PracticeOfferDetails = {
      messageId: published.messageId,
      convocatoriaId: published.convocatoriaId,
      company,
      requirements: neutralizeHtml(data.requirements),
      modality: data.modality,
      createdBy: input.publishedBy,
      createdAt: published.convocatoriaId.firstSentAt,
      updatedBy: input.publishedBy,
      updatedAt: published.convocatoriaId.firstSentAt,
      withdrawnAt: null
    };
    await offers.save(offer);
    return { ok: true, offer };
  }
}
