import type { MessageId } from '../value-objects/MessageId.js';

/**
 * Metadato de un adjunto: nunca se decodifica ni se entrega su contenido al
 * clasificador, solo se deja constancia de que existio (RF-04, criterio 5).
 */
export interface InstitutionalAttachment {
  readonly filename: string | null;
  readonly contentType: string;
  readonly approxSizeBytes: number;
}

/**
 * Resultado de HU-02 sobre un RawInstitutionalMessage: el cuerpo ya es texto
 * plano legible, sin firma institucional, aviso legal ni cadena de reenvio, y
 * los enlaces originales del HTML quedan conservados dentro del texto. Ningun
 * criterio de negocio (que es convocatoria, a que programa corresponde) se
 * decide aqui — eso pertenece al clasificador (HU-06 en adelante).
 */
export interface InstitutionalMessage {
  readonly messageId: MessageId;
  readonly mailboxUid: number;
  readonly sender: string;
  readonly subject: string;
  readonly sentAt: Date;
  readonly recipients: readonly string[];
  readonly body: string;
  readonly attachments: readonly InstitutionalAttachment[];
}
