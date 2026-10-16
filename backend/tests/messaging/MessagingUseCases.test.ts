import { describe, expect, it } from 'vitest';
import { MessagingFailureKind } from '../../src/contexts/messaging/domain/entities/MessagingFailure.js';
import { MAX_MESSAGE_LENGTH } from '../../src/contexts/messaging/domain/entities/Conversation.js';
import { ADMIN, buildMessagingHarness, OTHER_PROFESSOR, OTHER_STUDENT, PROFESSOR, STUDENT } from './messagingHarness.js';

async function startDefault(harness: ReturnType<typeof buildMessagingHarness>) {
  const result = await harness.useCases.startConversation.execute({
    requesterEmail: PROFESSOR.email,
    studentEmail: STUDENT.email,
    subject: '  Proyecto final ',
    text: ' Hola Julián, ¿cómo vas con el proyecto? '
  });
  if (!result.ok) throw new Error(result.message);
  return result.conversation;
}

describe('Mensajería profesor ↔ estudiante', () => {
  it('un profesor inicia una conversación con un estudiante y un primer mensaje', async () => {
    const harness = buildMessagingHarness();
    const conversation = await startDefault(harness);

    expect(conversation.professor).toEqual({ email: PROFESSOR.email, name: PROFESSOR.name });
    expect(conversation.student).toEqual({ email: STUDENT.email, name: STUDENT.name });
    expect(conversation.subject).toBe('Proyecto final');
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]).toMatchObject({ authorEmail: PROFESSOR.email, fromProfessor: true, text: 'Hola Julián, ¿cómo vas con el proyecto?' });
  });

  it('el estudiante ve la conversación en su bandeja y puede responder; el profesor ve la respuesta', async () => {
    const harness = buildMessagingHarness();
    const conversation = await startDefault(harness);
    harness.advance(5);

    const inbox = await harness.useCases.listConversations.execute({ requesterEmail: 'JULIAN.VARGAS@upb.edu.co' });
    expect(inbox.map((c) => c.id)).toEqual([conversation.id]);

    const reply = await harness.useCases.sendMessage.execute({ requesterEmail: STUDENT.email, conversationId: conversation.id, text: 'Bien, profe' });
    expect(reply.ok && reply.message).toMatchObject({ authorName: STUDENT.name, fromProfessor: false, text: 'Bien, profe' });

    const seenByProfessor = await harness.useCases.getConversation.execute({ requesterEmail: PROFESSOR.email, conversationId: conversation.id });
    expect(seenByProfessor.ok && seenByProfessor.conversation.messages.map((m) => m.text)).toEqual([
      'Hola Julián, ¿cómo vas con el proyecto?',
      'Bien, profe'
    ]);
    const professorInbox = await harness.useCases.listConversations.execute({ requesterEmail: PROFESSOR.email });
    expect(professorInbox[0]?.lastMessage?.text).toBe('Bien, profe');
  });

  it('un estudiante (o un administrador) no puede iniciar conversaciones', async () => {
    const harness = buildMessagingHarness();
    for (const requester of [STUDENT, ADMIN]) {
      const result = await harness.useCases.startConversation.execute({
        requesterEmail: requester.email,
        studentEmail: OTHER_STUDENT.email,
        subject: 'Hola',
        text: 'Hola'
      });
      expect(!result.ok && result.error).toBe(MessagingFailureKind.FORBIDDEN);
    }
  });

  it('el destinatario debe ser un estudiante existente', async () => {
    const harness = buildMessagingHarness();
    for (const studentEmail of ['nadie@upb.edu.co', OTHER_PROFESSOR.email, 42]) {
      const result = await harness.useCases.startConversation.execute({ requesterEmail: PROFESSOR.email, studentEmail, subject: 'Hola', text: 'Hola' });
      expect(!result.ok && result.error).toBe(MessagingFailureKind.NOT_FOUND);
    }
  });

  it('rechaza asunto o mensaje vacíos o demasiado largos', async () => {
    const harness = buildMessagingHarness();
    const base = { requesterEmail: PROFESSOR.email, studentEmail: STUDENT.email, subject: 'Hola', text: 'Hola' };
    for (const override of [{ subject: '   ' }, { text: '' }, { text: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) }, { subject: undefined }]) {
      const result = await harness.useCases.startConversation.execute({ ...base, ...override });
      expect(!result.ok && result.error).toBe(MessagingFailureKind.INVALID_CONTENT);
    }
    const conversation = await startDefault(harness);
    const empty = await harness.useCases.sendMessage.execute({ requesterEmail: STUDENT.email, conversationId: conversation.id, text: '  ' });
    expect(!empty.ok && empty.error).toBe(MessagingFailureKind.INVALID_CONTENT);
  });

  it('nadie fuera de la conversación puede verla ni escribir en ella, y no se distingue de una inexistente', async () => {
    const harness = buildMessagingHarness();
    const conversation = await startDefault(harness);

    for (const outsider of [OTHER_STUDENT, OTHER_PROFESSOR]) {
      expect(await harness.useCases.listConversations.execute({ requesterEmail: outsider.email })).toEqual([]);
      const read = await harness.useCases.getConversation.execute({ requesterEmail: outsider.email, conversationId: conversation.id });
      const write = await harness.useCases.sendMessage.execute({ requesterEmail: outsider.email, conversationId: conversation.id, text: 'hola' });
      const missing = await harness.useCases.getConversation.execute({ requesterEmail: outsider.email, conversationId: 'no-existe' });
      expect(read).toEqual(missing);
      expect(!write.ok && write.error).toBe(MessagingFailureKind.NOT_FOUND);
    }
  });

  it('la bandeja se ordena por el último mensaje', async () => {
    const harness = buildMessagingHarness();
    const first = await startDefault(harness);
    harness.advance(1);
    const second = await harness.useCases.startConversation.execute({ requesterEmail: PROFESSOR.email, studentEmail: OTHER_STUDENT.email, subject: 'Otro', text: 'Hola Camila' });
    if (!second.ok) throw new Error(second.message);
    harness.advance(1);
    await harness.useCases.sendMessage.execute({ requesterEmail: STUDENT.email, conversationId: first.id, text: 'Respondo' });

    const inbox = await harness.useCases.listConversations.execute({ requesterEmail: PROFESSOR.email });
    expect(inbox.map((c) => c.id)).toEqual([first.id, second.conversation.id]);
  });

  it('solo un profesor puede listar los estudiantes, ordenados por nombre', async () => {
    const harness = buildMessagingHarness();
    const forProfessor = await harness.useCases.listStudents.execute({ requesterEmail: PROFESSOR.email });
    expect(forProfessor.ok && forProfessor.students.map((s) => s.name)).toEqual(['Camila Torres', 'Julián Vargas']);

    const forStudent = await harness.useCases.listStudents.execute({ requesterEmail: STUDENT.email });
    expect(!forStudent.ok && forStudent.error).toBe(MessagingFailureKind.FORBIDDEN);
  });
});
