/**
 * Lo que el chatbot puede citar de una entrada: solo la version vigente, sin
 * historial, autores ni estado de administracion.
 */
export interface KnowledgeSource {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly category: string;
  readonly version: number;
  readonly updatedAt: Date;
}

/**
 * HU-41: puerto de lectura de la base de conocimiento, separado de
 * `ChatbotPort` (HU-42). Es dato del dominio bajo control institucional, no
 * conocimiento embebido en el modelo: el chatbot lo consulta en cada pregunta.
 *
 * Contrato pequeno y estable. Solo ve entradas vigentes: una retirada nunca
 * se devuelve (criterio 3), y una nueva se devuelve desde que se publica, sin
 * redespliegue (criterio 2) porque no hay cache ni indice precalculado.
 */
export interface KnowledgeBasePort {
  /** Entradas vigentes ordenadas por relevancia. Consulta vacia o sin coincidencias: lista vacia. */
  search(query: string, options?: { readonly limit?: number }): Promise<readonly KnowledgeSource[]>;
  /** Una entrada vigente por id, o `null` si no existe o fue retirada. */
  findById(id: string): Promise<KnowledgeSource | null>;
}
