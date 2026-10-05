/**
 * HU-08 (RF-11, RF-12, CU-01 paso 6): resultado de interpretar la fecha de
 * cierre declarada en un mensaje. La ambiguedad y la ausencia de plazo son
 * estados explicitos, no un `Date | null` — un `null` no distingue "no hay
 * plazo" de "no se pudo interpretar la fecha", y esa distincion es la que le
 * permite al estudiante confiar en el dato o saber que debe verificarlo.
 */
export type DueDate =
  | { readonly kind: 'con-fecha'; readonly date: Date }
  | { readonly kind: 'sin-vencimiento' }
  | { readonly kind: 'ambigua'; readonly candidates: readonly Date[]; readonly reason: string };
