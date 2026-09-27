import { neutralizeHtml } from '../../hardening/domain/services/HtmlEncoding.js';
import type { EditConvocatoria } from '../../ingestion/application/EditConvocatoria.js';
import type { PublishConvocatoria } from '../../ingestion/application/PublishConvocatoria.js';
import { MessageCategory } from '../../classification/domain/value-objects/MessageCategory.js';
import type { InstitutionalProgramCatalog } from '../../targeting/domain/ports/out/ProgramCatalogPort.js';
import { practiceOfferSubject, type PracticeOfferData, type PracticeOfferDetails } from '../domain/entities/PracticeOffer.js';
import { validateNewPracticeOffer } from '../domain/services/PracticeOfferValidation.js';
import { findDuplicateOffer, type PracticeDuplicateRules } from '../domain/services/PracticeDuplicatePolicy.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { PracticeConvocatoriaSnapshot, PracticeConvocatoriaSourcePort } from '../domain/ports/out/PracticeConvocatoriaSourcePort.js';
import type { PracticeOfferRepositoryPort } from '../domain/ports/out/PracticeOfferRepositoryPort.js';
import { invalidOffer, type PracticeOfferFailure } from './PracticeOfferResults.js';

export type PublishPracticeOfferResult =
  | {
      readonly ok: true;
      readonly offer: PracticeOfferDetails;
      /**
       * HU-22 criterio 5: `true` si la carga coincidio con una oferta ya
       * registrada (ingerida o cargada antes) y se consolido en ella en vez
       * de crear otra. `offer.messageId` es entonces el de la oferta existente.
       */
      readonly consolidated: boolean;
    }
  | PracticeOfferFailure;

/**
 * Carga manual de una oferta de practica (HU-24 criterios 1 a 4). Valida en
 * servidor (criterio 3) y publica a traves de `PublishConvocatoria` (HU-50):
 * el diseno de la historia pide que el backoffice sea driving adapter sobre
 * ese caso de uso, sin ruta de escritura alterna. Por eso la oferta manual
 * queda en los mismos repositorios que una ingerida, con categoria
 * `practica`, y entra al mismo feed segmentado, aviso de publicacion y
 * auditoria (criterios 2 y 4).
 *
 * HU-22 criterio 5: antes de publicar busca si la oferta ya esta registrada
 * (`findDuplicateOffer`). Si lo esta, no crea otro registro: completa el
 * existente con lo que el administrador diligencio, por `EditConvocatoria`
 * (auditado como edicion) y conserva la identidad de la oferta, de la que
 * dependen el feed, lo guardado por el estudiante (HU-16) y los avisos.
 * Lo que diligencia el administrador prevalece sobre lo extraido del correo.
 *
 * Operacion de administrador de contenido: declarada en
 * `config/protected-operations.json`; `publishedBy` lo provee ese control.
 */
export class PublishPracticeOffer {
  constructor(
    private readonly dependencies: {
      readonly publishConvocatoria: PublishConvocatoria;
      readonly editConvocatoria: EditConvocatoria;
      readonly offers: PracticeOfferRepositoryPort;
      readonly source: PracticeConvocatoriaSourcePort;
      readonly duplicateRules: PracticeDuplicateRules;
      readonly catalog: InstitutionalProgramCatalog;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: { readonly form: Readonly<Record<string, unknown>>; readonly publishedBy: string }): Promise<PublishPracticeOfferResult> {
    const { publishConvocatoria, offers, source, duplicateRules, catalog, clock } = this.dependencies;
    const validation = validateNewPracticeOffer(input.form, { catalog, now: clock.now() });
    if (!validation.ok) return invalidOffer(validation.issues);
    const data = validation.value;

    // HU-47, criterio 7: el texto libre se neutraliza una vez, al entrar.
    const company = neutralizeHtml(data.company);
    const description = neutralizeHtml(data.description);
    const requirements = neutralizeHtml(data.requirements);

    const duplicate = findDuplicateOffer(
      { company, applicationChannel: data.applicationChannel, dueDate: data.dueDate },
      await source.findPracticeConvocatorias(),
      duplicateRules
    );
    if (duplicate !== null) return this.consolidate(duplicate, { data, company, description, requirements }, input.publishedBy);

    const published = await publishConvocatoria.execute({
      sender: input.publishedBy,
      subject: practiceOfferSubject(company),
      body: description,
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
      requirements,
      modality: data.modality,
      createdBy: input.publishedBy,
      createdAt: published.convocatoriaId.firstSentAt,
      updatedBy: input.publishedBy,
      updatedAt: published.convocatoriaId.firstSentAt,
      withdrawnAt: null
    };
    await offers.save(offer);
    return { ok: true, offer, consolidated: false };
  }

  private async consolidate(
    existing: PracticeConvocatoriaSnapshot,
    form: { readonly data: PracticeOfferData; readonly company: string; readonly description: string; readonly requirements: string },
    publishedBy: string
  ): Promise<PublishPracticeOfferResult> {
    const { editConvocatoria, offers, clock } = this.dependencies;
    const now = clock.now();
    const current = existing.details;

    // La empresa forma parte del asunto y, con el, de la identidad (README, decision 3):
    // si la oferta ya la tiene no se cambia; si llego por correo, se completa.
    const next: PracticeOfferDetails = {
      messageId: existing.messageId,
      convocatoriaId: current?.convocatoriaId ?? {
        sender: existing.record.sender,
        subject: existing.record.subject,
        firstSentAt: existing.record.firstSentAt
      },
      company: current?.company ?? form.company,
      requirements: form.requirements,
      modality: form.data.modality,
      createdBy: current?.createdBy ?? publishedBy,
      createdAt: current?.createdAt ?? now,
      updatedBy: publishedBy,
      updatedAt: now,
      withdrawnAt: null
    };

    const extensionChanges: string[] = [];
    if (current === null || current.company !== next.company) extensionChanges.push('company');
    if (current === null || current.requirements !== next.requirements) extensionChanges.push('requirements');
    if (current === null || current.modality !== next.modality) extensionChanges.push('modality');

    const { changedFields } = await editConvocatoria.execute({
      messageId: existing.messageId,
      changes: {
        body: form.description,
        dueDate: { kind: 'con-fecha', date: form.data.dueDate },
        applicationLink: form.data.applicationChannel,
        targeting: form.data.targeting
      },
      extensionChanges,
      editedBy: publishedBy
    });
    // Sin cambios reales (carga identica a lo ya registrado) no se escribe ni se audita.
    if (changedFields.length === 0 && current !== null) return { ok: true, offer: current, consolidated: true };
    await offers.save(next);
    return { ok: true, offer: next, consolidated: true };
  }
}
