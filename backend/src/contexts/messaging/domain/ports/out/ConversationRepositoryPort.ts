import type { Conversation, ConversationSummary, Message } from '../../entities/Conversation.js';

export interface ConversationRepositoryPort {
  save(conversation: Conversation): Promise<void>;
  findById(id: string): Promise<Conversation | null>;
  /** Bandeja de un participante (como profesor o como estudiante), mas reciente primero. */
  findSummariesByParticipant(email: string): Promise<readonly ConversationSummary[]>;
  /** Agrega el mensaje y mueve `updatedAt`; `false` si la conversacion no existe. */
  appendMessage(conversationId: string, message: Message): Promise<boolean>;
}
