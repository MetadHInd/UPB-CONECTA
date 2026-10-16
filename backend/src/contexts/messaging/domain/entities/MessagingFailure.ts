export enum MessagingFailureKind {
  /** Solo un profesor puede iniciar conversaciones o ver el directorio de estudiantes. */
  FORBIDDEN = 'forbidden',
  /** No existe, o quien pregunta no participa en ella (no se distingue a proposito). */
  NOT_FOUND = 'not-found',
  INVALID_CONTENT = 'invalid-content'
}

export interface MessagingFailure {
  readonly ok: false;
  readonly error: MessagingFailureKind;
  readonly message: string;
}

export function messagingFailure(error: MessagingFailureKind, message: string): MessagingFailure {
  return { ok: false, error, message };
}

export const CONVERSATION_NOT_FOUND_MESSAGE = 'La conversación no existe o no tienes acceso a ella.';
