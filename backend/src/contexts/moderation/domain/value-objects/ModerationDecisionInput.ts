/**
 * HU-32: decision de moderacion de entrada, en su forma minima.
 *
 * Tipo propio y aislado en este archivo a proposito: la decision automatica
 * por umbral (HU-31) produce publicar / retener / bloquear con su categoria y
 * el fragmento que la motivo. Este contexto solo necesita esos campos para
 * explicarle al autor lo ocurrido y para sustentar la sancion (criterio 6).
 * Cuando HU-31 llegue a `main`, basta con un mapeo de su decision a este tipo
 * (o con reemplazar este archivo por el suyo): nada mas del contexto conoce la
 * forma de esa decision.
 *
 * `internalDetail` es opaco (puntaje, umbral, modelo...). Solo viaja hasta el
 * registro de auditoria; NUNCA a la vista del autor (criterio 3).
 */
export type ModerationVerdict = 'publish' | 'retain' | 'block';

export type ModeratedContentKind = 'post' | 'comment';

export interface ModerationDecisionInput {
  readonly contentId: string;
  readonly contentKind: ModeratedContentKind;
  /** Autor del contenido (sujeto verificado de la sesion), destinatario del aviso. */
  readonly authorEmail: string;
  readonly verdict: ModerationVerdict;
  /** Categoria de infraccion; obligatoria al retener o bloquear. */
  readonly category: string | null;
  /** Fragmento que motivo la decision; obligatorio al retener o bloquear. */
  readonly fragment: string | null;
  /** Quien decidio: la moderacion automatica u otro origen (reportes, administrador). */
  readonly detectedBy: string;
  /** Detalle interno del modelo; solo para auditoria. */
  readonly internalDetail?: Readonly<Record<string, unknown>>;
}
