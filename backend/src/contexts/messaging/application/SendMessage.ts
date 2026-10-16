import { isParticipant, MAX_MESSAGE_LENGTH, normalizeMessagingEmail, validateText, type Message } from '../domain/entities/Conversation.js';
import {
  CONVERSATION_NOT_FOUND_MESSAGE,
  MessagingFailureKind,
  messagingFailure,
  type MessagingFailure
} from '../domain/entities/MessagingFailure.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ConversationRepositoryPort } from '../domain/ports/out/ConversationRepositoryPort.js';
import type { MessagingIdGeneratorPort } from '../domain/ports/out/MessagingIdGeneratorPort.js';

export interface SendMessageInput {
  /** Sujeto de la sesion verificada; nunca un valor que el cliente elija. */
  readonly requesterEmail: string;
  readonly conversationId: string;
  readonly text: unknown;
}

export type SendMessageResult = { readonly ok: true; readonly message: Message } | MessagingFailure;

/**
 * Responder dentro de una conversacion existente. Solo sus dos participantes
 * pueden escribir; a cualquier otro se le responde igual que si no existiera,
 * para no revelar conversaciones ajenas.
 */
export class SendMessage {
  constructor(
    private readonly dependencies: {
      readonly conversations: ConversationRepositoryPort;
      readonly clock: ClockPort;
      readonly ids: MessagingIdGeneratorPort;
    }
  ) {}

  async execute(input: SendMessageInput): Promise<SendMessageResult> {
    const { conversations, clock, ids } = this.dependencies;
    const email = normalizeMessagingEmail(input.requesterEmail);

    const conversation = await conversations.findById(input.conversationId);
    if (!conversation || !isParticipant(conversation, email)) {
      return messagingFailure(MessagingFailureKind.NOT_FOUND, CONVERSATION_NOT_FOUND_MESSAGE);
    }

    const text = validateText(input.text, 'mensaje', MAX_MESSAGE_LENGTH);
    if (!text.valid) return messagingFailure(MessagingFailureKind.INVALID_CONTENT, text.message);

    const fromProfessor = conversation.professor.email === email;
    const message: Message = {
      id: ids.newId(),
      authorEmail: email,
      authorName: fromProfessor ? conversation.professor.name : conversation.student.name,
      fromProfessor,
      text: text.value,
      sentAt: clock.now()
    };
    if (!(await conversations.appendMessage(conversation.id, message))) {
      return messagingFailure(MessagingFailureKind.NOT_FOUND, CONVERSATION_NOT_FOUND_MESSAGE);
    }
    return { ok: true, message };
  }
}
