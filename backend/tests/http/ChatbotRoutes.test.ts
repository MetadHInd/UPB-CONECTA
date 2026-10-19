import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../src/infrastructure/http/server.js';
import { createAuthRouter } from '../../src/contexts/identity/infrastructure/http/authRoutes.js';
import { requireSession, sessionPrincipal } from '../../src/contexts/identity/infrastructure/http/requireSession.js';
import { createChatbotRouter } from '../../src/contexts/chatbot/infrastructure/http/chatbotRoutes.js';
import { ConverseWithChatbot } from '../../src/contexts/chatbot/application/ConverseWithChatbot.js';
import { AnswerStudentQuestion } from '../../src/contexts/chatbot/application/AnswerStudentQuestion.js';
import { ExtractiveChatbot } from '../../src/contexts/chatbot/infrastructure/adapters/out/extractive/ExtractiveChatbot.js';
import { InMemoryConversationContextStore } from '../../src/contexts/chatbot/infrastructure/adapters/out/memory/InMemoryConversationContextStore.js';
import { InMemoryEscalationLog } from '../../src/contexts/chatbot/infrastructure/adapters/out/memory/InMemoryEscalationLog.js';
import { loadOfficialChannel, loadOutOfScopePolicy } from '../../src/contexts/chatbot/infrastructure/config/JsonChatbotConfig.js';
import { KnowledgeContextBase } from '../../src/contexts/chatbot/infrastructure/integration/KnowledgeContextBase.js';
import { RegistryConvocatoriaReference } from '../../src/contexts/chatbot/infrastructure/integration/RegistryConvocatoriaReference.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { ADMIN, buildKnowledgeHarness, validForm } from '../knowledge/knowledgeHarness.js';
import { buildSessionHarness } from '../identity/sessionHarness.js';

const PASSWORD = 'S3cr3t!UPB';
const EMAIL = 'ana.perez@upb.edu.co';
let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function start() {
  const identity = buildSessionHarness();
  identity.provider.register({
    username: EMAIL,
    password: PASSWORD,
    profile: { name: 'Ana Pérez', email: EMAIL, program: 'Ingeniería de Sistemas e Informática', semester: 6 }
  });
  const knowledge = buildKnowledgeHarness();
  const published = await knowledge.publish.execute({ publishedBy: ADMIN, form: validForm() });
  if (!published.ok) throw new Error('la entrada de prueba debe publicarse');
  const clock = { now: () => new Date('2026-09-27T12:00:00Z') };
  const converse = new ConverseWithChatbot({
    answer: new AnswerStudentQuestion({
      chatbot: new ExtractiveChatbot(),
      knowledgeBase: new KnowledgeContextBase(knowledge.knowledgeBase),
      convocatorias: new RegistryConvocatoriaReference(new InMemoryConsolidatedMessageRegistry()),
      escalations: new InMemoryEscalationLog(),
      clock,
      officialChannel: loadOfficialChannel(),
      outOfScope: loadOutOfScopePolicy()
    }),
    conversations: new InMemoryConversationContextStore(),
    clock,
    idleMs: 30 * 60 * 1000
  });
  const app = createHttpServer([
    createAuthRouter(identity.authenticate, { refresh: identity.refresh, logout: identity.logout }),
    createChatbotRouter({ converse }, requireSession(identity.verifyAccess), (res) => sessionPrincipal(res).sessionId)
  ]);
  server = app.listen(0);
  await new Promise((resolve) => server!.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(method: string, path: string, options: { token?: string; body?: unknown } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  }
  const login = await call('POST', '/auth/login', { body: { username: EMAIL, password: PASSWORD } });
  return { call, token: login.body['session'].accessToken.value as string, entryId: published.entry.id };
}

describe('Chatbot por HTTP con sesión real', () => {
  it('exige sesión (RNF-14)', async () => {
    const { call } = await start();
    expect((await call('POST', '/chatbot/ask', { body: { question: 'hola' } })).status).toBe(401);
  });

  it('responde desde la base de conocimiento y cita la fuente (RF-65, RF-67)', async () => {
    const { call, token, entryId } = await start();
    const res = await call('POST', '/chatbot/ask', { token, body: { question: '¿Cuándo es la matrícula ordinaria?' } });
    expect(res.status).toBe(200);
    expect(res.body['answer'].kind).toBe('answered');
    expect(res.body['answer'].sources[0]).toMatchObject({ kind: 'knowledge-entry', entryId });
  });

  it('declara que no tiene información e indica el canal oficial, sin inventar (RF-68)', async () => {
    const { call, token } = await start();
    const res = await call('POST', '/chatbot/ask', { token, body: { question: 'zzz qqq xyzzy plugh' } });
    expect(res.status).toBe(200);
    expect(res.body['answer'].kind).toBe('escalated');
    expect(res.body['answer'].officialChannel).toBeDefined();
  });

  it.each([{}, { question: '' }, { question: '   ' }, { question: 42 }, { question: 'a'.repeat(1001) }])(
    'rechaza la pregunta inválida %j (RNF-15)',
    async (body) => {
      const { call, token } = await start();
      const res = await call('POST', '/chatbot/ask', { token, body });
      expect(res.status).toBe(400);
      expect(res.body['error']).toBe('invalid-question');
    }
  );
});
