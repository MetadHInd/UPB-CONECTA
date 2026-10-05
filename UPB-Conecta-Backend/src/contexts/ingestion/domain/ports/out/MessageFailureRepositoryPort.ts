/**
 * Correccion del bug 2: cuenta los ciclos de ingesta en los que un mismo
 * mensaje del buzon fallo. El cursor (HU-01) no avanza sobre un mensaje que
 * falla, asi que sin este contador un mensaje que falla siempre se reintenta
 * en cada ciclo, para siempre, y bloquea todo lo que llega despues.
 *
 * No hace falta limpiar el contador cuando el mensaje por fin se procesa: el
 * cursor lo deja atras y ese uid no se vuelve a leer.
 */
export interface MessageFailureRepositoryPort {
  /** Suma un fallo al uid y devuelve el total acumulado, incluido este. */
  recordFailure(mailboxUid: number, cause: string, at: Date): Promise<number>;
}
