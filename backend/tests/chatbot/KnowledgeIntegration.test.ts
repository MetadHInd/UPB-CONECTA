import { describe, expect, it } from 'vitest';
import { AnswerStudentQuestion } from '../../src/contexts/chatbot/application/AnswerStudentQuestion.js';
import { InMemoryEscalationLog } from '../../src/contexts/chatbot/infrastructure/adapters/out/memory/InMemoryEscalationLog.js';
import { StubChatbot } from '../../src/contexts/chatbot/infrastructure/adapters/out/memory/StubChatbot.js';
import { loadOfficialChannel, loadOutOfScopePolicy } from '../../src/contexts/chatbot/infrastructure/config/JsonChatbotConfig.js';
import { KnowledgeContextBase } from '../../src/contexts/chatbot/infrastructure/integration/KnowledgeContextBase.js';
import { RegistryConvocatoriaReference } from '../../src/contexts/chatbot/infrastructure/integration/RegistryConvocatoriaReference.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { ADMIN, buildKnowledgeHarness, validForm } from '../knowledge/knowledgeHarness.js';

function buildChatbot() {
  const knowledge = buildKnowledgeHarness();
  const clock = { now: () => new Date('2026-09-27T12:00:00Z') };
  // El proveedor cita la primera entrada que recibió como contexto, como haría un modelo bien portado.
  const provider = new StubChatbot((request) => ({
    text: 'La matrícula ordinaria va del 3 al 14 de agosto.',
    sources: request.entries.slice(0, 1).map((entry) => ({ kind: 'knowledge-entry' as const, entryId: entry.id }))
  }));
  const answer = new AnswerStudentQuestion({
    chatbot: provider,
    knowledgeBase: new KnowledgeContextBase(knowledge.knowledgeBase),
    convocatorias: new RegistryConvocatoriaReference(new InMemoryConsolidatedMessageRegistry()),
    escalations: new InMemoryEscalationLog(),
    clock,
    officialChannel: loadOfficialChannel(),
    outOfScope: loadOutOfScopePolicy()
  });
  return { knowledge, answer, provider };
}

describe('HU-41 + HU-42 — el chatbot responde con la base de conocimiento que administra el backoffice', () => {
  it('una entrada publicada sin redespliegue se cita como fuente en la siguiente pregunta', async () => {
    const { knowledge, answer } = buildChatbot();
    const published = await knowledge.publish.execute({ publishedBy: ADMIN, form: validForm() });
    if (!published.ok) throw new Error('la entrada de prueba debe publicarse');

    const result = await answer.execute({ question: '¿Cuándo es la matrícula ordinaria?' });

    expect(result.kind).toBe('answered');
    if (result.kind !== 'answered') return;
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ kind: 'knowledge-entry' });
  });

  it('al retirar la entrada el chatbot deja de usarla y escala por falta de información', async () => {
    const { knowledge, answer, provider } = buildChatbot();
    const published = await knowledge.publish.execute({ publishedBy: ADMIN, form: validForm() });
    if (!published.ok) throw new Error('la entrada de prueba debe publicarse');
    await knowledge.withdraw.execute({ withdrawnBy: ADMIN, entryId: published.entry.id });
    provider.requests.length = 0;

    const result = await answer.execute({ question: '¿Cuándo es la matrícula ordinaria?' });

    expect(result).toMatchObject({ kind: 'escalated', reason: 'no-information' });
    expect(provider.requests).toHaveLength(0);
  });
});
