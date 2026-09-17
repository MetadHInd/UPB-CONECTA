import { ClassificationResult } from '../../../../domain/entities/ClassificationResult.js';
import { MessageCategory } from '../../../../domain/value-objects/MessageCategory.js';
import type { ClassificationPort } from '../../../../domain/ports/out/ClassificationPort.js';
import type { InstitutionalMessage } from '../../../../../ingestion/domain/entities/InstitutionalMessage.js';

function resolveCategory(text: string): MessageCategory {
  const normalized = text.toLowerCase();

  if (/(convocatoria|plazo|fecha de cierre|cierre|apertura|postulaci[oó]n|inscripciones)/.test(normalized)) {
    return MessageCategory.CONVOCATORIA_CON_PLAZO;
  }

  if (/(evento|seminario|charla|taller|encuentro|conferencia)/.test(normalized)) {
    return MessageCategory.EVENTO;
  }

  if (/(beca|financiamiento|ayuda econ[óo]mica|ayuda economica)/.test(normalized)) {
    return MessageCategory.BECA;
  }

  if (/(movilidad|intercambio|estancia|internacional)/.test(normalized)) {
    return MessageCategory.MOVILIDAD;
  }

  if (/(curso de idiomas|curso de ingl[ée]s|ingles|ingl[ée]s|idioma|alem[áa]n|franc[ée]s)/.test(normalized)) {
    return MessageCategory.CURSO_DE_IDIOMAS;
  }

  if (/(pr[áa]ctica|pasant[ia]|pr[áa]cticas|pasant[ia]s)/.test(normalized)) {
    return MessageCategory.PRACTICA;
  }

  return MessageCategory.BOLETIN_INFORMATIVO;
}

export class InMemoryClassificationAdapter implements ClassificationPort {
  async classify(message: InstitutionalMessage): Promise<ClassificationResult> {
    const category = resolveCategory(`${message.subject} ${message.body}`);
    const isKnownFalsePositiveCase =
      category === MessageCategory.BOLETIN_INFORMATIVO &&
      /(bienestar|inscripci[oó]n)/.test(`${message.subject} ${message.body}`.toLowerCase());

    return ClassificationResult.fromCategory(category, {
      isKnownFalsePositiveCase,
      reason: isKnownFalsePositiveCase ? 'Caso de falso positivo documentado: boletín de bienestar con inscripción.' : undefined
    });
  }
}
