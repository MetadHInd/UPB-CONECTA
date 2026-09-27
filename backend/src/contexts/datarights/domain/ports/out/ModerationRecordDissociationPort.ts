/**
 * Disociacion del registro de moderacion (HU-48 criterio 5): la supresion no
 * puede borrar las infracciones y sanciones porque la Universidad debe poder
 * sustentarlas, pero tampoco puede dejarlas ligadas al titular. Se reemplaza
 * el identificador del titular por un seudonimo sin correspondencia guardada.
 */
export interface ModerationRecordDissociationPort {
  /** Devuelve cuantos registros disocio. Idempotente: tras la primera vez ya no hay nada que disociar. */
  dissociate(subject: string, pseudonym: string): Promise<number>;
}
