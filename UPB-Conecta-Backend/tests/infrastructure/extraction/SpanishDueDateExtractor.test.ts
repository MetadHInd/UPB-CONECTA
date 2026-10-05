import { describe, it, expect } from 'vitest';
import { SpanishDueDateExtractor } from '../../../src/contexts/ingestion/infrastructure/extraction/SpanishDueDateExtractor.js';
import { MessageId } from '../../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import type { InstitutionalMessage } from '../../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';

const extractor = new SpanishDueDateExtractor();

function message(body: string, sentAt = '2026-08-01T12:00:00Z'): InstitutionalMessage {
  return {
    messageId: MessageId.fromHeader('<a@upb.edu.co>'),
    mailboxUid: 1,
    sender: 'coordinacion@upb.edu.co',
    subject: 'Convocatoria',
    sentAt: new Date(sentAt),
    recipients: [],
    body,
    attachments: []
  };
}

describe('SpanishDueDateExtractor', () => {
  it('criterio 1: extrae una fecha numerica dd/mm/aaaa en medianoche Colombia (UTC-05:00)', () => {
    const { dueDate } = extractor.extract(message('Dirigida a Ingenieria. Cierre: 30/08/2026.'));
    expect(dueDate).toEqual({ kind: 'con-fecha', date: new Date('2026-08-30T05:00:00Z') });
  });

  it('criterio 2: sin ninguna fecha en el cuerpo, se marca explicitamente sin vencimiento', () => {
    const { dueDate } = extractor.extract(message('Actividades de la semana. Inscripcion abierta permanente.'));
    expect(dueDate).toEqual({ kind: 'sin-vencimiento' });
  });

  it('criterio 3: resuelve fecha textual con dia de la semana y sin año explicito', () => {
    const { dueDate } = extractor.extract(message('Postulaciones hasta el viernes 12 de septiembre.', '2026-08-01T12:00:00Z'));
    expect(dueDate).toEqual({ kind: 'con-fecha', date: new Date('2026-09-12T05:00:00Z') });
  });

  it('criterio 3: resuelve fecha textual con año explicito', () => {
    const { dueDate } = extractor.extract(message('Las inscripciones cierran el 14 de agosto de 2026.'));
    expect(dueDate).toEqual({ kind: 'con-fecha', date: new Date('2026-08-14T05:00:00Z') });
  });

  it('sin año: si la fecha ya paso respecto al envio, se infiere el año siguiente', () => {
    const { dueDate } = extractor.extract(message('El plazo vence el 20 de enero.', '2026-08-01T12:00:00Z'));
    expect(dueDate).toEqual({ kind: 'con-fecha', date: new Date('2027-01-20T05:00:00Z') });
  });

  it('criterio 4: entre fecha del evento y fecha de cierre, selecciona la anclada a una palabra de cierre', () => {
    const { dueDate } = extractor.extract(
      message('El evento sera el 5 de octubre. Cierre de inscripciones: 20/09/2026.')
    );
    expect(dueDate).toEqual({ kind: 'con-fecha', date: new Date('2026-09-20T05:00:00Z') });
  });

  it('criterio 4: dos fechas de cierre distintas y contradictorias se marcan como ambiguas', () => {
    const { dueDate } = extractor.extract(
      message('El plazo vence el 10/09/2026. Aclaracion: el limite en realidad es el 15/09/2026.')
    );
    expect(dueDate.kind).toBe('ambigua');
    if (dueDate.kind === 'ambigua') {
      expect(dueDate.candidates).toHaveLength(2);
    }
  });

  it('criterio 5: identifica el enlace de postulacion cuando hay varios enlaces en el cuerpo', () => {
    const { applicationLink } = extractor.extract(
      message('Mas informacion en https://upb.edu.co/info. Postulate en https://upb.edu.co/postulacion/482.')
    );
    expect(applicationLink).toBe('https://upb.edu.co/postulacion/482');
  });

  it('criterio 5: sin enlace en el cuerpo, devuelve null', () => {
    const { applicationLink } = extractor.extract(message('Cierre: 30/08/2026.'));
    expect(applicationLink).toBeNull();
  });
});
