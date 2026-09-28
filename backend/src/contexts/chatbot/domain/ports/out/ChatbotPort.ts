import type { KnowledgeEntry } from '../../entities/KnowledgeEntry.js';
import type { ProposedSource } from '../../value-objects/SourceReference.js';

/** Un intercambio previo de la conversación, ya enmascarado (HU-40). */
export interface ChatbotHistoryTurn {
  readonly question: string;
  readonly answer: string | null;
}

/** HU-40 criterio 6: toda respuesta se presenta en español. */
export const CHATBOT_RESPONSE_LANGUAGE = 'es';

export interface ChatbotRequest {
  readonly question: string;
  /** Contexto recuperado del repositorio; el modelo no tiene otra fuente legitima. */
  readonly entries: readonly KnowledgeEntry[];
  /** HU-40 criterio 2: intercambios previos de la sesión, del más antiguo al más reciente. Vacío en una pregunta suelta. */
  readonly history: readonly ChatbotHistoryTurn[];
  /** Idioma en que el proveedor debe responder; el adaptador real lo traduce a su instrucción. */
  readonly responseLanguage: typeof CHATBOT_RESPONSE_LANGUAGE;
}

export interface ChatbotOutput {
  readonly text: string;
  /** Fuentes que el modelo dice haber usado. No se confia en ellas: ver `anchorResponse`. */
  readonly sources: readonly ProposedSource[];
}

/**
 * Puerto de salida hacia el proveedor de IA (HU-42). Puede fallar o
 * alucinar. Lo que recibe no lleva datos identificatorios del estudiante
 * (HU-40 criterio 4): el tipo no tiene campos de identidad y los textos
 * llegan enmascarados.
 */
export interface ChatbotPort {
  generate(request: ChatbotRequest): Promise<ChatbotOutput>;
}
