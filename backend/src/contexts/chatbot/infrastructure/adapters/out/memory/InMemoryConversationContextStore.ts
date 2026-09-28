import type { ChatbotConversation } from '../../../../domain/entities/ChatbotConversation.js';
import type { ConversationContextStorePort } from '../../../../domain/ports/out/ConversationContextStorePort.js';

/**
 * Único adaptador del contexto conversacional (HU-40): la memoria del
 * proceso. Un reinicio pierde las conversaciones, que es lo esperado de un
 * contexto efímero; no hay nada que migrar ni que borrar en disco.
 */
export class InMemoryConversationContextStore implements ConversationContextStorePort {
  private readonly conversations = new Map<string, ChatbotConversation>();

  async find(sessionId: string): Promise<ChatbotConversation | null> {
    const found = this.conversations.get(sessionId);
    return found === undefined ? null : structuredClone(found);
  }

  async save(conversation: ChatbotConversation): Promise<void> {
    this.conversations.set(conversation.sessionId, structuredClone(conversation));
  }

  async discard(sessionId: string): Promise<boolean> {
    return this.conversations.delete(sessionId);
  }

  async discardIdleSince(cutoff: Date): Promise<number> {
    let discarded = 0;
    for (const [sessionId, conversation] of this.conversations) {
      if (conversation.lastActivityAt.getTime() <= cutoff.getTime()) {
        this.conversations.delete(sessionId);
        discarded += 1;
      }
    }
    return discarded;
  }

  get size(): number {
    return this.conversations.size;
  }
}
