import { MessageId } from '../../domain/value-objects/MessageId.js';
import type { RawInstitutionalMessage } from '../../domain/entities/RawInstitutionalMessage.js';

const SENDERS = [
  'idiomas@upb.edu.co',
  'bienestar@upb.edu.co',
  'internacionalizacion@upb.edu.co',
  'practicas.ingenierias@upb.edu.co',
  'registro@upb.edu.co'
];

/**
 * HU-55, criterio 3: genera un lote sintetico y reproducible (mismo `count`
 * produce siempre los mismos mensajes) para medir el tiempo de ingesta sin
 * depender de un corpus real ni de una conexion externa. Cada mensaje trae
 * MIME completo (encabezados + cuerpo) para que atraviese normalizacion
 * (HU-02), deduplicacion (HU-03) y extraccion de fecha/enlace (HU-08) como
 * lo haria un mensaje real.
 */
export function buildSyntheticMessages(count: number, baseUid = 1000): RawInstitutionalMessage[] {
  const messages: RawInstitutionalMessage[] = [];

  for (let i = 0; i < count; i += 1) {
    const uid = baseUid + i;
    const sender = SENDERS[i % SENDERS.length]!;
    const subject = `Convocatoria sintetica ${i}`;
    const receivedAt = new Date(Date.UTC(2026, 7, 1, 8, 0, 0) + i * 60_000);
    const closesInDays = 10 + (i % 20);
    const closingDate = new Date(receivedAt.getTime() + closesInDays * 24 * 60 * 60 * 1000);
    const day = closingDate.getUTCDate();
    const month = closingDate.getUTCMonth() + 1;
    const year = closingDate.getUTCFullYear();

    messages.push({
      messageId: MessageId.fromHeader(`<synthetic-${uid}@upb.edu.co>`),
      mailboxUid: uid,
      sender,
      subject,
      receivedAt,
      rawBody: `From: Coordinacion <${sender}>
Subject: ${subject}
Content-Type: text/plain; charset=us-ascii

Convocatoria de prueba numero ${i}. Cierre: ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}.
Postulate en https://upb.edu.co/postulacion/${uid}.`
    });
  }

  return messages;
}
