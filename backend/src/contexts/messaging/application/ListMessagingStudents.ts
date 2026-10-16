import { normalizeMessagingEmail } from '../domain/entities/Conversation.js';
import { MessagingFailureKind, messagingFailure, type MessagingFailure } from '../domain/entities/MessagingFailure.js';
import type { DirectoryEntry, MessagingDirectoryPort } from '../domain/ports/out/MessagingDirectoryPort.js';

export type ListMessagingStudentsResult = { readonly ok: true; readonly students: readonly DirectoryEntry[] } | MessagingFailure;

/**
 * Estudiantes a los que un profesor puede escribir. Solo para profesores: un
 * estudiante no necesita (ni debe) poder listar el directorio completo.
 */
export class ListMessagingStudents {
  constructor(private readonly dependencies: { readonly directory: MessagingDirectoryPort }) {}

  async execute(input: { readonly requesterEmail: string }): Promise<ListMessagingStudentsResult> {
    const requester = await this.dependencies.directory.findByEmail(normalizeMessagingEmail(input.requesterEmail));
    if (requester?.role !== 'professor') {
      return messagingFailure(MessagingFailureKind.FORBIDDEN, 'Solo un profesor puede ver el directorio de estudiantes.');
    }
    const students = await this.dependencies.directory.listStudents();
    return { ok: true, students: [...students].sort((a, b) => a.name.localeCompare(b.name, 'es')) };
  }
}
