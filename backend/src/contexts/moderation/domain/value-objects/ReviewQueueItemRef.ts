/**
 * HU-49: identidad de un elemento de la cola de revision. Union
 * discriminada en vez de un `id: string` con formato implicito
 * (`"quarantine:123"`) — evita parsear texto y deja que TypeScript
 * verifique que `PublishReviewQueueItem` solo se llame sobre un elemento
 * `pending-review` (una convocatoria en cuarentena nunca se normalizo, no
 * hay nada valido que publicar).
 */
export type ReviewQueueItemRef =
  | { readonly kind: 'quarantine'; readonly mailboxUid: number }
  | { readonly kind: 'pending-review'; readonly messageId: string };

export function reviewQueueItemRefKey(ref: ReviewQueueItemRef): string {
  return ref.kind === 'quarantine' ? `quarantine:${ref.mailboxUid}` : `pending-review:${ref.messageId}`;
}
