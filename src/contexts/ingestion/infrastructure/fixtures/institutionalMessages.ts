import { MessageId } from '../../domain/value-objects/MessageId.js';
import type { RawInstitutionalMessage } from '../../domain/entities/RawInstitutionalMessage.js';

/**
 * Corpus minimo de mensajes institucionales anonimizados.
 *
 * Sustituye al buzon real mientras la Universidad lo habilita (riesgo R-01) y
 * cubre los casos que el equipo observo en el correo masivo: convocatoria con
 * plazo, boletin sin plazo, reenvio del mismo anuncio con Message-ID distinto y
 * oferta de practica.
 */
export function buildFixtureMessages(): RawInstitutionalMessage[] {
  return [
    {
      messageId: MessageId.fromHeader('<conv-ingles-2026-20@upb.edu.co>'),
      mailboxUid: 101,
      sender: 'idiomas@upb.edu.co',
      subject: 'Apertura de inscripciones curso de ingles 2026-20',
      receivedAt: new Date('2026-08-03T13:05:00Z'),
      rawBody: '<html><body><p>Las inscripciones cierran el 14 de agosto de 2026.</p></body></html>'
    },
    {
      messageId: MessageId.fromHeader('<boletin-bienestar-0834@upb.edu.co>'),
      mailboxUid: 102,
      sender: 'bienestar@upb.edu.co',
      subject: 'Boletin semanal de Bienestar Universitario',
      receivedAt: new Date('2026-08-04T09:30:00Z'),
      rawBody: '<html><body><p>Actividades de la semana. Inscripcion abierta permanente.</p></body></html>'
    },
    {
      messageId: MessageId.fromHeader('<mov-intercambio-2027-1@upb.edu.co>'),
      mailboxUid: 103,
      sender: 'internacionalizacion@upb.edu.co',
      subject: 'Convocatoria de movilidad academica 2027-1',
      receivedAt: new Date('2026-08-05T15:40:00Z'),
      rawBody: '<html><body><p>Dirigida a Ingenieria de Sistemas. Cierre: 30/08/2026.</p></body></html>'
    },
    {
      messageId: MessageId.fromHeader('<practica-santander-77@upb.edu.co>'),
      mailboxUid: 104,
      sender: 'practicas.ingenierias@upb.edu.co',
      subject: 'Oferta de practica empresarial, modalidad hibrida',
      receivedAt: new Date('2026-08-06T11:15:00Z'),
      rawBody: '<html><body><p>Postulaciones hasta el 20 de agosto.</p></body></html>'
    },
    {
      // Mismo asunto que el primero pero identidad distinta: es un reenvio real,
      // no un duplicado de procesamiento. Lo consolida HU-03, no HU-01.
      messageId: MessageId.fromHeader('<conv-ingles-2026-20-recordatorio@upb.edu.co>'),
      mailboxUid: 105,
      sender: 'idiomas@upb.edu.co',
      subject: 'Apertura de inscripciones curso de ingles 2026-20',
      receivedAt: new Date('2026-08-11T13:00:00Z'),
      rawBody: '<html><body><p>Recordatorio. Las inscripciones cierran el 14 de agosto.</p></body></html>'
    }
  ];
}
