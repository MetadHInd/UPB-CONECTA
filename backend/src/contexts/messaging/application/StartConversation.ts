import {
  MAX_MESSAGE_LENGTH,
  MAX_SUBJECT_LENGTH,
  normalizeMessagingEmail,
  validateText,
  type Conversation
} from '../domain/entities/Conversation.js';
import { MessagingFailureKind, messagingFailure, type MessagingFailure } from '../domain/entities/MessagingFailure.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ConversationRepositoryPort } from '../domain/ports/out/ConversationRepositoryPort.js';
import type { MessagingDirectoryPort } from '../domain/ports/out/MessagingDirectoryPort.js';
import type { MessagingIdGeneratorPort } from '../domain/ports/out/MessagingIdGeneratorPort.js';

export interface StartConversationInput {
  /** Sujeto de la sesion verificada; nunca un valor que el cliente elija. */
  readonly requesterEmail: string;
  readonly studentEmail: unknown;
  readonly subject: unknown;
  readonly text: unknown;
}

export type StartConversationResult = { readonly ok: true; readonly conversation: Conversation } | MessagingFailure;

/**
 * Un profesor abre una conversacion privada con un estudiante, con un primer
 * mensaje. Solo un profesor puede iniciarla (el rol se lee del directorio en
 * el servidor) y el destinatario debe ser un estudiante existente.
 */
export class StartConversation {
  constructor(
    private readonly dependencies: {
      readonly conversations: ConversationRepositoryPort;
      readonly directory: MessagingDirectoryPort;
      readonly clock: ClockPort;
      readonly ids: MessagingIdGeneratorPort;
    }
  ) {}

  async execute(input: StartConversationInput): Promise<StartConversationResult> {
    const { conversations, directory, clock, ids } = this.dependencies;

    const professor = await directory.findByEmail(normalizeMessagingEmail(input.requesterEmail));
    if (professor?.role !== 'professor') {
      return messagingFailure(MessagingFailureKind.FORBIDDEN, 'Solo un profesor puede iniciar conversaciones.');
    }

    const subject = validateText(input.subject, 'asunto', MAX_SUBJECT_LENGTH);
    if (!subject.valid) return messagingFailure(MessagingFailureKind.INVALID_CONTENT, subject.message);
    const text = validateText(input.text, 'mensaje', MAX_MESSAGE_LENGTH);
    if (!text.valid) return messagingFailure(MessagingFailureKind.INVALID_CONTENT, text.message);

    const student =
      typeof input.studentEmail === 'string' ? await directory.findByEmail(normalizeMessagingEmail(input.studentEmail)) : null;
    if (student?.role !== 'student') {
      return messagingFailure(MessagingFailureKind.NOT_FOUND, 'El estudiante no existe.');
    }

    const now = clock.now();
    const conversation: Conversation = {
      id: ids.newId(),
      professor: { email: professor.email, name: professor.name },
      student: { email: student.email, name: student.name },
      subject: subject.value,
      messages: [
        {
          id: ids.newId(),
          authorEmail: professor.email,
          authorName: professor.name,
          fromProfessor: true,
          text: text.value,
          sentAt: now
        }
      ],
      createdAt: now,
      updatedAt: now
    };
    await conversations.save(conversation);
    return { ok: true, conversation };
  }
}
