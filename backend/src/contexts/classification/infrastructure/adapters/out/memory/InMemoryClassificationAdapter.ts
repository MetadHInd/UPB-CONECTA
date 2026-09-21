import { ClassificationResult } from '../../../../domain/entities/ClassificationResult.js';
import { MessageCategory } from '../../../../domain/value-objects/MessageCategory.js';
import { ConfidenceScore } from '../../../../domain/value-objects/ConfidenceScore.js';
import type { ClassificationPort } from '../../../../domain/ports/out/ClassificationPort.js';
import type { InstitutionalMessage } from '../../../../../ingestion/domain/entities/InstitutionalMessage.js';

/**
 * HU-10, decision de diseño 5: no hay proveedor de IA real en este
 * repositorio, asi que este stub debe generar un puntaje de confianza
 * deterministico (nunca aleatorio sin semilla, para que las pruebas sean
 * reproducibles). Se elige un valor fijo por rama: 0.9 cuando un patron
 * especifico coincidio (alta confianza en la deteccion), 0.4 cuando cae en
 * el resultado por defecto sin ningun patron reconocido (justo el caso que
 * HU-10 quiere exponer, en vez de publicar en silencio). El puntaje real
 * dependera del proveedor de IA real cuando exista — mismo limite ya
 * documentado para la categoria en si en el README de HU-06.
 */
const HIGH_CONFIDENCE = ConfidenceScore.of(0.9);
const DEFAULT_BUCKET_CONFIDENCE = ConfidenceScore.of(0.4);

function resolveCategory(text: string): { category: MessageCategory; confidenceScore: ConfidenceScore } {
  const normalized = text.toLowerCase();

  if (/(convocatoria|plazo|fecha de cierre|cierre|apertura|postulaci[oó]n|inscripciones)/.test(normalized)) {
    return { category: MessageCategory.CONVOCATORIA_CON_PLAZO, confidenceScore: HIGH_CONFIDENCE };
  }

  if (/(evento|seminario|charla|taller|encuentro|conferencia)/.test(normalized)) {
    return { category: MessageCategory.EVENTO, confidenceScore: HIGH_CONFIDENCE };
  }

  if (/(beca|financiamiento|ayuda econ[óo]mica|ayuda economica)/.test(normalized)) {
    return { category: MessageCategory.BECA, confidenceScore: HIGH_CONFIDENCE };
  }

  if (/(movilidad|intercambio|estancia|internacional)/.test(normalized)) {
    return { category: MessageCategory.MOVILIDAD, confidenceScore: HIGH_CONFIDENCE };
  }

  if (/(curso de idiomas|curso de ingl[ée]s|ingles|ingl[ée]s|idioma|alem[áa]n|franc[ée]s)/.test(normalized)) {
    return { category: MessageCategory.CURSO_DE_IDIOMAS, confidenceScore: HIGH_CONFIDENCE };
  }

  if (/(pr[áa]ctica|pasant[ia]|pr[áa]cticas|pasant[ia]s)/.test(normalized)) {
    return { category: MessageCategory.PRACTICA, confidenceScore: HIGH_CONFIDENCE };
  }

  return { category: MessageCategory.BOLETIN_INFORMATIVO, confidenceScore: DEFAULT_BUCKET_CONFIDENCE };
}

export class InMemoryClassificationAdapter implements ClassificationPort {
  async classify(message: InstitutionalMessage): Promise<ClassificationResult> {
    const { category, confidenceScore } = resolveCategory(`${message.subject} ${message.body}`);
    const isKnownFalsePositiveCase =
      category === MessageCategory.BOLETIN_INFORMATIVO &&
      /(bienestar|inscripci[oó]n)/.test(`${message.subject} ${message.body}`.toLowerCase());

    return ClassificationResult.fromCategory(category, {
      isKnownFalsePositiveCase,
      reason: isKnownFalsePositiveCase ? 'Caso de falso positivo documentado: boletín de bienestar con inscripción.' : undefined,
      confidenceScore
    });
  }
}
