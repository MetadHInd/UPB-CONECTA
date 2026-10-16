import { isParticipant, toSummary, type Conversation, type ConversationSummary, type Message } from '../../../../domain/entities/Conversation.js';
import type { ConversationRepositoryPort } from '../../../../domain/ports/out/ConversationRepositoryPort.js';

export class InMemoryConversationRepository implements ConversationRepositoryPort {
  private readonly conversations = new Map<string, Conversation>();

  async save(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation);
  }

  async findById(id: string): Promise<Conversation | null> {
    return this.conversations.get(id) ?? null;
  }

  async findSummariesByParticipant(email: string): Promise<readonly ConversationSummary[]> {
    return [...this.conversations.values()]
      .filter((conversation) => isParticipant(conversation, email))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(toSummary);
  }

  async appendMessage(conversationId: string, message: Message): Promise<boolean> {
    const current = this.conversations.get(conversationId);
    if (!current) return false;
    this.conversations.set(conversationId, { ...current, messages: [...current.messages, message], updatedAt: message.sentAt });
    return true;
  }
}
