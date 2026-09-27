import type { ConvocatoriaId } from '../../../ingestion/domain/value-objects/ConvocatoriaId.js';

/** Fuente que el modelo AFIRMA usar. Es una salida no confiable: se verifica antes de entregarla. */
export type ProposedSource =
  | { readonly kind: 'knowledge-entry'; readonly entryId: string }
  | { readonly kind: 'convocatoria'; readonly convocatoriaId: ConvocatoriaId };

/**
 * Fuente ya verificada contra el repositorio. La referencia a una convocatoria
 * lleva su id completo (HU-42 criterio 4) para que el cliente navegue al
 * detalle (HU-15).
 */
export type AnchoredSource =
  | { readonly kind: 'knowledge-entry'; readonly entryId: string; readonly title: string }
  | { readonly kind: 'convocatoria'; readonly convocatoriaId: ConvocatoriaId; readonly title: string };

export function sourceKey(source: AnchoredSource): string {
  return source.kind === 'knowledge-entry'
    ? `kb:${source.entryId}`
    : `conv:${source.convocatoriaId.sender}|${source.convocatoriaId.subject}|${source.convocatoriaId.firstSentAt.getTime()}`;
}
