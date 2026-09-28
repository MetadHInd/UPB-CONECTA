import { describe, expect, it } from 'vitest';
import { AnswerStudentQuestion } from '../../src/contexts/chatbot/application/AnswerStudentQuestion.js';
import { ConverseWithChatbot } from '../../src/contexts/chatbot/application/ConverseWithChatbot.js';
import { EndChatbotConversation } from '../../src/contexts/chatbot/application/EndChatbotConversation.js';
import { DEFAULT_CONVERSATION_IDLE_MS, MAX_CONVERSATION_TURNS } from '../../src/contexts/chatbot/domain/entities/ChatbotConversation.js';
import type { KnowledgeEntry } from '../../src/contexts/chatbot/domain/entities/KnowledgeEntry.js';
import type { ChatbotOutput, ChatbotRequest } from '../../src/contexts/chatbot/domain/ports/out/ChatbotPort.js';
import { InMemoryConversationContextStore } from '../../src/contexts/chatbot/infrastructure/adapters/out/memory/InMemoryConversationContextStore.js';
import { InMemoryEscalationLog } from '../../src/contexts/chatbot/infrastructure/adapters/out/memory/InMemoryEscalationLog.js';
import { InMemoryKnowledgeBase } from '../../src/contexts/chatbot/infrastructure/adapters/out/memory/InMemoryKnowledgeBase.js';
import { StubChatbot } from '../../src/contexts/chatbot/infrastructure/adapters/out/memory/StubChatbot.js';
import { loadOfficialChannel, loadOutOfScopePolicy } from '../../src/contexts/chatbot/infrastructure/config/JsonChatbotConfig.js';
import { RegistryConvocatoriaReference } from '../../src/contexts/chatbot/infrastructure/integration/RegistryConvocatoriaReference.js';
import { ChatbotConversationSessionEndedAdapter } from '../../src/contexts/identity/infrastructure/adapters/out/chatbot/ChatbotConversationSessionEndedAdapter.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { buildSessionHarness, login } from '../identity/sessionHarness.js';

const MINUTE = 60_000;
const SESSION = 'sesion-1';
const ASKER = { name: 'Ana María Gómez', email: 'ana.gomez@upb.edu.co', studentId: '000123456' };

const ENTRY_CARNET: KnowledgeEntry = {
  id: 'kb-carnet',
  title: 'Solicitud de carnet estudiantil',
  content: 'El carnet se solicita en la oficina de registro presentando el documento de identidad. La entrega tarda tres días hábiles.',
  validUntil: null
};
const ENTRY_BECAS: KnowledgeEntry = {
  id: 'kb-becas',
  title: 'Becas de excelencia académica',
  content: 'Las becas de excelencia se solicitan en bienestar universitario al inicio de cada semestre.',
  validUntil: null
};

/**
 * El modelo de prueba responde con la primera entrada que recibe, citándola.
 * Sin entradas no se le llama (lo decide HU-42).
 */
function answerFromFirstEntry(request: ChatbotRequest): ChatbotOutput {
  const entry = request.entries[0]!;
  return { text: `Según "${entry.title}": ${entry.content}`, sources: [{ kind: 'knowledge-entry', entryId: entry.id }] };
}

function build(script: (request: ChatbotRequest) => ChatbotOutput | Promise<ChatbotOutput> = answerFromFirstEntry) {
  let now = new Date('2026-09-28T15:00:00Z');
  const clock = { now: () => now };
  const chatbot = new StubChatbot(script);
  const escalations = new InMemoryEscalationLog();
  const conversations = new InMemoryConversationContextStore();
  const answer = new AnswerStudentQuestion({
    chatbot,
    knowledgeBase: new InMemoryKnowledgeBase(clock, [ENTRY_CARNET, ENTRY_BECAS]),
    convocatorias: new RegistryConvocatoriaReference(new InMemoryConsolidatedMessageRegistry()),
    escalations,
    clock,
    officialChannel: loadOfficialChannel(),
    outOfScope: loadOutOfScopePolicy()
  });
  return {
    answer,
    chatbot,
    escalations,
    conversations,
    converse: new ConverseWithChatbot({ answer, conversations, clock, idleMs: DEFAULT_CONVERSATION_IDLE_MS }),
    end: new EndChatbotConversation({ conversations }),
    advanceMinutes(minutes: number) {
      now = new Date(now.getTime() + minutes * MINUTE);
    }
  };
}

describe('HU-40 — consulta en lenguaje natural con contexto conversacional de sesión (RF-65, RF-69, RNF-19, RNF-39)', () => {
  describe('criterio 1 — responde a partir de la base de conocimiento institucional', () => {
    it('una pregunta administrativa en lenguaje natural recibe una respuesta anclada a la entrada', async () => {
      const chat = build();

      const reply = await chat.converse.execute({ sessionId: SESSION, question: '¿Cómo solicito el carnet estudiantil?' });

      expect(reply).toMatchObject({ kind: 'answered', sources: [{ kind: 'knowledge-entry', entryId: 'kb-carnet' }] });
      expect(chat.chatbot.requests[0]!.entries.map((entry) => entry.id)).toEqual(['kb-carnet']);
    });
  });

  describe('criterio 2 — una pregunta de seguimiento conserva el contexto de la sesión', () => {
    it('"¿y cuánto se demora?" se responde con la entrada de la pregunta anterior y el modelo recibe el historial', async () => {
      const chat = build();
      const first = await chat.converse.execute({ sessionId: SESSION, question: '¿Cómo solicito el carnet estudiantil?' });

      const followUp = await chat.converse.execute({ sessionId: SESSION, question: '¿Y cuánto se demora?' });

      expect(followUp).toMatchObject({ kind: 'answered', sources: [{ entryId: 'kb-carnet' }] });
      const request = chat.chatbot.requests[1]!;
      expect(request.entries.map((entry) => entry.id)).toEqual(['kb-carnet']);
      expect(request.history).toEqual([{ question: '¿Cómo solicito el carnet estudiantil?', answer: first.kind === 'answered' ? first.text : null }]);
    });

    it('sin el contexto de la sesión, la misma pregunta de seguimiento no tiene de dónde responder y se escala', async () => {
      const chat = build();
      await chat.converse.execute({ sessionId: SESSION, question: '¿Cómo solicito el carnet estudiantil?' });

      const otherSession = await chat.converse.execute({ sessionId: 'otra-sesion', question: '¿Y cuánto se demora?' });

      expect(otherSession).toMatchObject({ kind: 'escalated', reason: 'no-information' });
    });

    it('una pregunta nueva recupera sus propias entradas además de las citadas antes', async () => {
      const chat = build();
      await chat.converse.execute({ sessionId: SESSION, question: '¿Cómo solicito el carnet estudiantil?' });

      await chat.converse.execute({ sessionId: SESSION, question: '¿Dónde pido las becas de excelencia?' });

      expect(chat.chatbot.requests[1]!.entries.map((entry) => entry.id)).toEqual(['kb-becas', 'kb-carnet']);
    });

    it(`conserva los últimos ${MAX_CONVERSATION_TURNS} intercambios`, async () => {
      const chat = build();
      for (let turn = 1; turn <= MAX_CONVERSATION_TURNS + 2; turn += 1) {
        await chat.converse.execute({ sessionId: SESSION, question: `Pregunta ${turn} sobre el carnet` });
      }

      const conversation = await chat.conversations.find(SESSION);
      expect(conversation?.turns.map((turn) => turn.question)).toEqual(
        Array.from({ length: MAX_CONVERSATION_TURNS }, (_, index) => `Pregunta ${index + 3} sobre el carnet`)
      );
    });

    it('una pregunta vacía no se responde ni entra al contexto', async () => {
      const chat = build();

      expect(await chat.converse.execute({ sessionId: SESSION, question: '   ' })).toEqual({ kind: 'invalid-question' });
      expect(await chat.conversations.find(SESSION)).toBeNull();
    });
  });

  describe('criterio 3 — al cerrar la sesión el contexto se descarta y no queda asociado a la identidad', () => {
    it('cerrar la sesión (LogoutSession de identity) descarta la conversación de esa sesión', async () => {
      const chat = build();
      const identity = buildSessionHarness({ sessionEnded: new ChatbotConversationSessionEndedAdapter(chat.end) });
      const session = await login(identity);
      const verified = await identity.verifyAccess.execute({ accessToken: session.accessToken.value, origin: '10.0.0.1' });
      if (!verified.ok) throw new Error(verified.message);
      const { sessionId } = verified.principal;
      await chat.converse.execute({ sessionId, question: '¿Cómo solicito el carnet estudiantil?' });
      expect(await chat.conversations.find(sessionId)).not.toBeNull();

      expect(await identity.logout.execute({ refreshToken: session.refreshToken.value, origin: '10.0.0.1' })).toEqual({ ok: true });

      expect(await chat.conversations.find(sessionId)).toBeNull();
      expect(chat.conversations.size).toBe(0);
    });

    it('tras el tiempo sin actividad la conversación se descarta aunque la sesión siga abierta', async () => {
      const chat = build();
      await chat.converse.execute({ sessionId: SESSION, question: '¿Cómo solicito el carnet estudiantil?' });
      await chat.converse.execute({ sessionId: 'otra-sesion', question: '¿Dónde pido las becas de excelencia?' });
      chat.advanceMinutes(30);

      expect(await chat.converse.execute({ sessionId: SESSION, question: '¿Y cuánto se demora?' })).toMatchObject({ kind: 'escalated' });
      expect(await chat.conversations.find('otra-sesion')).toBeNull();
      expect((await chat.conversations.find(SESSION))?.turns).toHaveLength(1);
    });

    it('un poco antes de ese tiempo el contexto sigue vigente', async () => {
      const chat = build();
      await chat.converse.execute({ sessionId: SESSION, question: '¿Cómo solicito el carnet estudiantil?' });
      chat.advanceMinutes(29);

      expect(await chat.converse.execute({ sessionId: SESSION, question: '¿Y cuánto se demora?' })).toMatchObject({ kind: 'answered' });
    });

    it('la conversación guardada no contiene la identidad del estudiante', async () => {
      const chat = build();

      await chat.converse.execute({ sessionId: SESSION, question: 'Soy Ana Gómez, ¿cómo solicito el carnet?', asker: ASKER });

      const stored = JSON.stringify(await chat.conversations.find(SESSION));
      for (const identifying of ['Ana', 'Gómez', 'ana.gomez', ASKER.email, ASKER.studentId]) expect(stored).not.toContain(identifying);
    });

    it('descartar una sesión sin conversación no es un error', async () => {
      expect(await build().end.execute({ sessionId: 'nunca-conversó' })).toEqual({ discarded: false });
    });

    it('sin sesión autenticada no hay conversación', async () => {
      await expect(build().converse.execute({ sessionId: ' ', question: '¿Cómo solicito el carnet?' })).rejects.toThrow(/sesión/);
    });
  });

  describe('criterio 4 — lo que se envía al proveedor no incorpora datos identificatorios', () => {
    it('la pregunta y el historial llegan enmascarados y la solicitud no tiene campos de identidad', async () => {
      const chat = build();
      await chat.converse.execute({
        sessionId: SESSION,
        question: 'Hola, soy Ana María Gómez (000123456), escríbanme a ana.gomez@upb.edu.co o al 300 555 1234. ¿Cómo solicito el carnet?',
        asker: ASKER
      });
      await chat.converse.execute({ sessionId: SESSION, question: '¿Y cuánto se demora? Gracias, Ana', asker: ASKER });

      for (const request of chat.chatbot.requests) {
        expect(Object.keys(request).sort()).toEqual(['entries', 'history', 'question', 'responseLanguage']);
        const sent = JSON.stringify({ question: request.question, history: request.history });
        for (const identifying of ['Ana', 'María', 'Gómez', 'ana.gomez', '000123456', '300 555 1234']) expect(sent).not.toContain(identifying);
      }
      expect(chat.chatbot.requests[0]!.question).toBe(
        'Hola, soy [nombre] [nombre] [nombre] ([dato]), escríbanme a [correo] o al [número]. ¿Cómo solicito el carnet?'
      );
    });

    it('sin la identidad de quien pregunta, igual se enmascaran correos y números largos', async () => {
      const chat = build();

      await chat.converse.execute({ sessionId: SESSION, question: 'Mi correo es alguien@upb.edu.co, ¿cómo solicito el carnet?' });

      expect(chat.chatbot.requests[0]!.question).toBe('Mi correo es [correo], ¿cómo solicito el carnet?');
    });
  });

  describe('criterio 4 — también fuera de una conversación (uso directo de HU-42)', () => {
    it('AnswerStudentQuestion enmascara la pregunta antes de enviarla al proveedor', async () => {
      const chat = build();

      await chat.answer.execute({ question: 'Escribo desde alguien@upb.edu.co, ¿cómo solicito el carnet?' });

      expect(chat.chatbot.requests[0]).toMatchObject({ question: 'Escribo desde [correo], ¿cómo solicito el carnet?', history: [] });
    });
  });

  describe('criterio 5 — lo que excede el alcance sigue el escalamiento de HU-42', () => {
    it('una pregunta sobre notas no llega al modelo y remite a la aplicación institucional', async () => {
      const chat = build();

      const reply = await chat.converse.execute({ sessionId: SESSION, question: '¿Cuáles son mis notas del semestre?' });

      expect(reply).toMatchObject({ kind: 'out-of-scope', topicId: 'notas' });
      expect(chat.chatbot.requests).toHaveLength(0);
      expect((await chat.conversations.find(SESSION))?.turns).toEqual([expect.objectContaining({ answer: null, citedEntryIds: [] })]);
    });

    it('una respuesta sin fuente se escala al canal oficial, sin guardar la identidad en el registro', async () => {
      const chat = build(() => ({ text: 'Creo que es en la biblioteca.', sources: [] }));

      const reply = await chat.converse.execute({ sessionId: SESSION, question: 'Soy Ana, ¿cómo solicito el carnet?', asker: ASKER });

      expect(reply).toMatchObject({ kind: 'escalated', reason: 'unanchored-response', officialChannel: loadOfficialChannel() });
      expect(chat.escalations.records).toEqual([expect.objectContaining({ question: 'Soy [nombre], ¿cómo solicito el carnet?', studentId: null })]);
    });
  });

  describe('criterio 6 — toda respuesta se presenta en español', () => {
    it('el proveedor recibe siempre la instrucción de responder en español', async () => {
      const chat = build();
      await chat.converse.execute({ sessionId: SESSION, question: '¿Cómo solicito el carnet estudiantil?' });
      await chat.converse.execute({ sessionId: SESSION, question: '¿Y cuánto se demora?' });

      expect(chat.chatbot.requests.map((request) => request.responseLanguage)).toEqual(['es', 'es']);
    });

    it('los mensajes propios del chatbot están en español', async () => {
      const chat = build(() => ({ text: '', sources: [] }));

      const outOfScope = await chat.converse.execute({ sessionId: SESSION, question: '¿Cuál es mi promedio academico?' });
      const escalated = await chat.converse.execute({ sessionId: SESSION, question: '¿Cómo solicito el carnet?' });
      const noInformation = await chat.converse.execute({ sessionId: SESSION, question: 'xyzw' });

      expect(outOfScope).toMatchObject({ message: expect.stringMatching(/^Consultar .* corresponde a la aplicación institucional/) });
      expect(escalated).toMatchObject({ message: expect.stringMatching(/^No pude darte una respuesta confiable\. Consulta el canal oficial/) });
      expect(noInformation).toMatchObject({ message: expect.stringMatching(/^No tengo información suficiente/) });
    });
  });
});
