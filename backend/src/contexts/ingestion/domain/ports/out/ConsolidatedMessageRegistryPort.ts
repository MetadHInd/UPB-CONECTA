/**
 * Registro de mensajes consolidados por deduplicacion semantica (HU-03).
 *
 * Distinto de `ProcessedMessageRegistryPort`: aquel evita reprocesar el mismo
 * `Message-ID` (idempotencia tecnica); este agrupa reenvios con `Message-ID`
 * distinto pero mismo remitente+asunto dentro de una ventana temporal
 * (deduplicacion semantica, RF-05).
 */
export interface ConsolidatedMessageRecord {
  readonly sender: string;
  readonly subject: string;
  readonly body: string;
  /** Fecha del primer envio del grupo consolidado (se conserva siempre). */
  readonly firstSentAt: Date;
  /** Fecha del envio mas reciente: ancla movil de la ventana temporal. */
  readonly lastSentAt: Date;
  /** Cantidad de reenvios detectados (no cuenta el envio original). */
  readonly resendCount: number;
}

export interface ConsolidatedMessageRegistryPort {
  /**
   * Busca un grupo consolidado con el mismo remitente y asunto cuyo ultimo
   * envio registrado caiga dentro de `windowMs` respecto a `referenceDate`.
   * Devuelve null si no hay ninguno (el mensaje inicia un grupo nuevo).
   */
  findWithinWindow(
    sender: string,
    subject: string,
    referenceDate: Date,
    windowMs: number
  ): Promise<ConsolidatedMessageRecord | null>;

  save(record: ConsolidatedMessageRecord): Promise<void>;
}
