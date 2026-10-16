import { normalizeMessagingEmail, type ConversationSummary } from '../domain/entities/Conversation.js';
import type { ConversationRepositoryPort } from '../domain/ports/out/ConversationRepositoryPort.js';

/** Bandeja del usuario de la sesion: solo las conversaciones donde participa. */
export class ListConversations {
  constructor(private readonly dependencies: { readonly conversations: ConversationRepositoryPort }) {}

  async execute(input: { readonly requesterEmail: string }): Promise<readonly ConversationSummary[]> {
    return this.dependencies.conversations.findSummariesByParticipant(normalizeMessagingEmail(input.requesterEmail));
  }
}
