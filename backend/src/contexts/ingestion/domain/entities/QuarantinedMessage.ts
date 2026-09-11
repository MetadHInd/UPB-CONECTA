/**
 * HU-04 (RF-06, CU-01 excepcion E2): un mensaje que no pudo traducirse a
 * `RawInstitutionalMessage` (por ejemplo, sin `Message-ID`) no se descarta:
 * se conserva con su causa y su contenido original para diagnostico, y para
 * poder reprocesarlo mas adelante sin una reingesta completa del buzon
 * (criterio 5, diferido hasta que exista un punto de entrada HTTP — ver
 * `src/contexts/ingestion/README.md`).
 */
export interface QuarantinedMessage {
  readonly mailboxUid: number;
  readonly cause: string;
  readonly rawSource: string;
  readonly quarantinedAt: Date;
}
