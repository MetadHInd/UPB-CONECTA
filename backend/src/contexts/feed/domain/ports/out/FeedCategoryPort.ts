/**
 * Categoria definitiva de cada mensaje (RF-20). `feed` no conoce el contexto
 * `classification`: un adaptador de integracion implementa este puerto.
 */
export interface FeedCategoryPort {
  categoriesFor(messageIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** Categorias que el estudiante puede usar como filtro. */
  allowedCategories(): readonly string[];
}
