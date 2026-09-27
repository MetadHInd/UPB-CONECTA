import { neutralizeHtml } from '../../hardening/domain/services/HtmlEncoding.js';
import type { ConvocatoriaChanges, EditConvocatoria } from '../../ingestion/application/EditConvocatoria.js';
import { ConvocatoriaAlreadyWithdrawnError, ConvocatoriaNotFoundError } from '../../ingestion/application/WithdrawConvocatoria.js';
import type { InstitutionalProgramCatalog } from '../../targeting/domain/ports/out/ProgramCatalogPort.js';
import type { PracticeOfferDetails } from '../domain/entities/PracticeOffer.js';
import { validatePracticeOfferChanges } from '../domain/services/PracticeOfferValidation.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { PracticeOfferRepositoryPort } from '../domain/ports/out/PracticeOfferRepositoryPort.js';
import { invalidOffer, offerNotFound, offerWithdrawn, type PracticeOfferFailure } from './PracticeOfferResults.js';

export type EditPracticeOfferResult =
  | { readonly ok: true; readonly offer: PracticeOfferDetails; readonly changedFields: readonly string[] }
  | PracticeOfferFailure;

/** Nombre del campo en la convocatoria -> nombre en el formulario de la oferta. */
const FORM_FIELD: Readonly<Record<string, string>> = {
  body: 'description',
  dueDate: 'dueDate',
  applicationLink: 'applicationChannel',
  targeting: 'targeting'
};

/**
 * Editar una oferta manual (HU-24 criterio 5). Lo comun a toda convocatoria
 * se edita con `EditConvocatoria`, que lo audita; lo propio de la practica
 * (requisitos, modalidad) se guarda aqui y viaja en la misma entrada de
 * auditoria. Los avisos de vencimiento se recalculan solos: el planificador
 * de HU-19 relee fecha y programas en cada ciclo (ver `EditConvocatoria`).
 */
export class EditPracticeOffer {
  constructor(
    private readonly dependencies: {
      readonly editConvocatoria: EditConvocatoria;
      readonly offers: PracticeOfferRepositoryPort;
      readonly catalog: InstitutionalProgramCatalog;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(input: {
    readonly messageId: string;
    readonly form: Readonly<Record<string, unknown>>;
    readonly editedBy: string;
  }): Promise<EditPracticeOfferResult> {
    const { editConvocatoria, offers, catalog, clock } = this.dependencies;
    const current = await offers.findByMessageId(input.messageId);
    if (current === null) return offerNotFound(input.messageId);
    if (current.withdrawnAt !== null) return offerWithdrawn();

    const now = clock.now();
    const validation = validatePracticeOfferChanges(input.form, { catalog, now });
    if (!validation.ok) return invalidOffer(validation.issues);
    const changes = validation.value;

    let next: PracticeOfferDetails = current;
    const extensionChanges: string[] = [];
    if (changes.requirements !== undefined && neutralizeHtml(changes.requirements) !== current.requirements) {
      next = { ...next, requirements: neutralizeHtml(changes.requirements) };
      extensionChanges.push('requirements');
    }
    if (changes.modality !== undefined && changes.modality !== current.modality) {
      next = { ...next, modality: changes.modality };
      extensionChanges.push('modality');
    }

    const convocatoriaChanges: ConvocatoriaChanges = {
      ...(changes.description !== undefined ? { body: neutralizeHtml(changes.description) } : {}),
      ...(changes.dueDate !== undefined ? { dueDate: { kind: 'con-fecha' as const, date: changes.dueDate } } : {}),
      ...(changes.applicationChannel !== undefined ? { applicationLink: changes.applicationChannel } : {}),
      ...(changes.targeting !== undefined ? { targeting: changes.targeting } : {})
    };

    let changedFields: readonly string[];
    try {
      ({ changedFields } = await editConvocatoria.execute({
        messageId: input.messageId,
        changes: convocatoriaChanges,
        extensionChanges,
        editedBy: input.editedBy
      }));
    } catch (error) {
      if (error instanceof ConvocatoriaNotFoundError) return offerNotFound(input.messageId);
      // Retirada por fuera del backoffice de practicas (HU-50 directo).
      if (error instanceof ConvocatoriaAlreadyWithdrawnError) return offerWithdrawn();
      throw error;
    }

    if (changedFields.length > 0) {
      next = { ...next, updatedBy: input.editedBy, updatedAt: now };
      await offers.save(next);
    }
    return { ok: true, offer: next, changedFields: changedFields.map((field) => FORM_FIELD[field] ?? field) };
  }
}
