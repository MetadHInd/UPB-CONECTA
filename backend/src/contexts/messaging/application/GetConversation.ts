import { isParticipant, type Conversation } from '../domain/entities/Conversation.js';
import {
  CONVERSATION_NOT_FOUND_MESSAGE,
  MessagingFailureKind,
  messagingFailure,
  type MessagingFailure
} from '../domain/entities/MessagingFailure.js';
import type { ConversationRepositoryPort } from '../domain/ports/out/ConversationRepositoryPort.js';

export type GetConversationResult = { readonly ok: true; readonly conversation: Conversation } | MessagingFailure;

/** Historial completo de una conversacion, solo para sus dos participantes. */
export class GetConversation {
  constructor(private readonly dependencies: { readonly conversations: ConversationRepositoryPort }) {}

  async execute(input: { readonly requesterEmail: string; readonly conversationId: string }): Promise<GetConversationResult> {
    const conversation = await this.dependencies.conversations.findById(input.conversationId);
    if (!conversation || !isParticipant(conversation, input.requesterEmail)) {
      return messagingFailure(MessagingFailureKind.NOT_FOUND, CONVERSATION_NOT_FOUND_MESSAGE);
    }
    return { ok: true, conversation };
  }
}
