import type { ChatbotConversation } from '../../entities/ChatbotConversation.js';

/**
 * Contexto de las conversaciones activas (HU-40 criterios 2 y 3). Solo tiene
 * adaptador en memoria, a propósito: no existe una colección donde el
 * contexto pueda persistir más allá de la sesión. Agregar uno exige volver a
 * revisar el criterio 3.
 */
export interface ConversationContextStorePort {
  find(sessionId: string): Promise<ChatbotConversation | null>;
  save(conversation: ChatbotConversation): Promise<void>;
  /** `true` si había una conversación que descartar. */
  discard(sessionId: string): Promise<boolean>;
  /** Descarta las conversaciones sin actividad desde `cutoff`; devuelve cuántas. */
  discardIdleSince(cutoff: Date): Promise<number>;
}
