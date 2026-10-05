import { describe, it, expect } from 'vitest';
import { SpanishDueDateExtractor } from '../../../src/contexts/ingestion/infrastructure/extraction/SpanishDueDateExtractor.js';
import { MessageId } from '../../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import type { InstitutionalMessage } from '../../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';

const extractor = new SpanishDueDateExtractor();

function message(body: string, sentAt: string): InstitutionalMessage {
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

/**
 * HU-08, criterio 6 / DoD: corpus etiquetado con la fecha declarada en cada
 * mensaje, midiendo que la extraccion acierta en al menos el 95% de los
 * casos. Cubre los formatos y variaciones descritos en los criterios 1-4.
 */
const CORPUS: readonly { desc: string; body: string; sentAt: string; expected: Date | 'sin-vencimiento' }[] = [
  { desc: 'numerico dd/mm/aaaa', body: 'Cierre: 30/08/2026.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-08-30T05:00:00Z') },
  { desc: 'textual con año', body: 'Las inscripciones cierran el 14 de agosto de 2026.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-08-14T05:00:00Z') },
  { desc: 'textual sin año, mismo año', body: 'Postulaciones hasta el 20 de agosto.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-08-20T05:00:00Z') },
  { desc: 'textual con dia de la semana', body: 'Aplica hasta el viernes 12 de septiembre.', sentAt: '2026-09-01T12:00:00Z', expected: new Date('2026-09-12T05:00:00Z') },
  { desc: 'sin año, ya paso -> año siguiente', body: 'El plazo vence el 20 de enero.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2027-01-20T05:00:00Z') },
  { desc: 'palabra clave "plazo"', body: 'El plazo es el 05/09/2026.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-09-05T05:00:00Z') },
  { desc: 'palabra clave "limite"', body: 'Fecha limite: 15/10/2026.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-10-15T05:00:00Z') },
  { desc: 'mes setiembre (variante ortografica)', body: 'Cierra el 10 de setiembre de 2026.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-09-10T05:00:00Z') },
  { desc: 'fecha de cierre y fecha de evento distintas', body: 'El taller es el 3 de noviembre. Cierre de inscripciones: 25/10/2026.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-10-25T05:00:00Z') },
  { desc: 'sin ninguna fecha', body: 'Boletin informativo de la semana, sin plazos asociados.', sentAt: '2026-08-01T12:00:00Z', expected: 'sin-vencimiento' },
  { desc: 'sin plazo, texto largo', body: 'Recordatorio permanente sobre los servicios de bienestar universitario disponibles todo el semestre.', sentAt: '2026-08-01T12:00:00Z', expected: 'sin-vencimiento' },
  { desc: 'fin de mes (28)', body: 'Cierre: 28/02/2027.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2027-02-28T05:00:00Z') },
  { desc: 'primero del mes', body: 'Vence el 01/12/2026.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-12-01T05:00:00Z') },
  { desc: 'enlace y fecha juntos, sin confundir el año con la fecha', body: 'Postulate antes del 18 de agosto en https://upb.edu.co/postulacion/501.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-08-18T05:00:00Z') },
  { desc: 'mayusculas en el mes', body: 'CIERRE: 22 DE AGOSTO DE 2026.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-08-22T05:00:00Z') },
  { desc: 'reenvio con recordatorio', body: 'Recordatorio: las inscripciones cierran el 14 de agosto de 2026.', sentAt: '2026-08-11T12:00:00Z', expected: new Date('2026-08-14T05:00:00Z') },
  { desc: 'fecha con guion bajo cierre', body: 'La convocatoria vence el 30/09/2026 sin prorroga.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-09-30T05:00:00Z') },
  { desc: 'mes marzo con año explicito', body: 'Cierre de postulaciones: 5 de marzo de 2027.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2027-03-05T05:00:00Z') },
  { desc: 'evento sin fecha de cierre explicita, unica fecha del cuerpo', body: 'El conversatorio se realizara el 9 de octubre.', sentAt: '2026-08-01T12:00:00Z', expected: new Date('2026-10-09T05:00:00Z') },
  { desc: 'boletin de bienestar sin fecha (fixture real HU-01)', body: 'Actividades de la semana. Inscripcion abierta permanente.', sentAt: '2026-08-04T09:30:00Z', expected: 'sin-vencimiento' }
];

describe('SpanishDueDateExtractor — corpus etiquetado (criterio 6 / DoD)', () => {
  it(`acierta en al menos el 95% de ${CORPUS.length} mensajes etiquetados`, () => {
    let correct = 0;
    const failures: string[] = [];

    for (const testCase of CORPUS) {
      const { dueDate } = extractor.extract(message(testCase.body, testCase.sentAt));
      const matches =
        testCase.expected === 'sin-vencimiento'
          ? dueDate.kind === 'sin-vencimiento'
          : dueDate.kind === 'con-fecha' && dueDate.date.getTime() === testCase.expected.getTime();

      if (matches) {
        correct += 1;
      } else {
        failures.push(`${testCase.desc}: esperado=${testCase.expected}, obtenido=${JSON.stringify(dueDate)}`);
      }
    }

    const accuracy = correct / CORPUS.length;
    expect(accuracy, `Fallos:\n${failures.join('\n')}`).toBeGreaterThanOrEqual(0.95);
  });
});
