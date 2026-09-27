import type { KnowledgeEntry } from '../../entities/KnowledgeEntry.js';
import type { ProposedSource } from '../../value-objects/SourceReference.js';

export interface ChatbotRequest {
  readonly question: string;
  /** Contexto recuperado del repositorio; el modelo no tiene otra fuente legitima. */
  readonly entries: readonly KnowledgeEntry[];
}

export interface ChatbotOutput {
  readonly text: string;
  /** Fuentes que el modelo dice haber usado. No se confia en ellas: ver `anchorResponse`. */
  readonly sources: readonly ProposedSource[];
}

/** Puerto de salida hacia el proveedor de IA (HU-42). Puede fallar o alucinar. */
export interface ChatbotPort {
  generate(request: ChatbotRequest): Promise<ChatbotOutput>;
}
