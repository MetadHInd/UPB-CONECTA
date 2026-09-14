/**
 * HU-15: identificador estable de un grupo consolidado (HU-03), para poder
 * pedir "el detalle de esta convocatoria" en vez de solo poder buscar
 * "dentro de esta ventana temporal" (`findWithinWindow`). Mismo esquema que
 * ya usaban internamente los adaptadores de `ConsolidatedMessageRegistryPort`
 * como `_id`/clave — se formaliza aqui en el dominio para no duplicar la
 * logica de construccion de la clave en cada adaptador.
 */
export interface ConvocatoriaId {
  readonly sender: string;
  readonly subject: string;
  readonly firstSentAt: Date;
}

export function convocatoriaIdToString(id: ConvocatoriaId): string {
  return `${id.sender}|${id.subject}|${id.firstSentAt.getTime()}`;
}
