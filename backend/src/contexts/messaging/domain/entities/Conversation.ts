/**
 * Mensajeria privada profesor <-> estudiante. Una conversacion tiene
 * exactamente dos participantes, identificados por su correo institucional
 * (el mismo `subject` de la sesion, HU-45). La visibilidad es por
 * participante, nunca por rol ni por programa: ni otros estudiantes ni otros
 * profesores pueden leerla ni escribir en ella.
 */
export interface Participant {
  readonly email: string;
  readonly name: string;
}

export interface Message {
  readonly id: string;
  readonly authorEmail: string;
  readonly authorName: string;
  readonly fromProfessor: boolean;
  readonly text: string;
  readonly sentAt: Date;
}

export interface Conversation {
  readonly id: string;
  readonly professor: Participant;
  readonly student: Participant;
  readonly subject: string;
  readonly messages: readonly Message[];
  readonly createdAt: Date;
  /** Fecha del ultimo mensaje: ordena la bandeja, mas reciente primero. */
  readonly updatedAt: Date;
}

/** Vista de bandeja: la conversacion sin el historial, solo con su ultimo mensaje. */
export interface ConversationSummary {
  readonly id: string;
  readonly professor: Participant;
  readonly student: Participant;
  readonly subject: string;
  readonly lastMessage: Message | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const MAX_SUBJECT_LENGTH = 120;
export const MAX_MESSAGE_LENGTH = 2000;

export function normalizeMessagingEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isParticipant(conversation: Pick<Conversation, 'professor' | 'student'>, email: string): boolean {
  const normalized = normalizeMessagingEmail(email);
  return conversation.professor.email === normalized || conversation.student.email === normalized;
}

export function toSummary(conversation: Conversation): ConversationSummary {
  const { messages, ...rest } = conversation;
  return { ...rest, lastMessage: messages[messages.length - 1] ?? null };
}

export type TextValidation = { readonly valid: true; readonly value: string } | { readonly valid: false; readonly message: string };

/**
 * El texto se guarda tal cual (recortado): el cliente Android lo pinta como
 * texto plano, no como HTML. Un cliente web futuro debe escaparlo al
 * mostrarlo, igual que con cualquier otro dato de usuario.
 */
export function validateText(raw: unknown, field: string, maxLength: number): TextValidation {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { valid: false, message: `El campo ${field} es obligatorio.` };
  }
  const value = raw.trim();
  if (value.length > maxLength) {
    return { valid: false, message: `El campo ${field} admite como máximo ${maxLength} caracteres.` };
  }
  return { valid: true, value };
}
