import { describe, it, expect } from 'vitest';
import { AnswerStudentQuestion } from '../../src/contexts/chatbot/application/AnswerStudentQuestion.js';
import { InMemoryKnowledgeBase } from '../../src/contexts/chatbot/infrastructure/adapters/out/memory/InMemoryKnowledgeBase.js';
import { StubChatbot } from '../../src/contexts/chatbot/infrastructure/adapters/out/memory/StubChatbot.js';
import { InMemoryEscalationLog } from '../../src/contexts/chatbot/infrastructure/adapters/out/memory/InMemoryEscalationLog.js';
import { RegistryConvocatoriaReference } from '../../src/contexts/chatbot/infrastructure/integration/RegistryConvocatoriaReference.js';
import { loadOfficialChannel, loadOutOfScopePolicy } from '../../src/contexts/chatbot/infrastructure/config/JsonChatbotConfig.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import type { ChatbotOutput } from '../../src/contexts/chatbot/domain/ports/out/ChatbotPort.js';
import type { KnowledgeEntry } from '../../src/contexts/chatbot/domain/entities/KnowledgeEntry.js';
import type { ConsolidatedMessageRecord } from '../../src/contexts/ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';

const NOW = new Date('2026-09-13T12:00:00Z');
const channel = loadOfficialChannel();
const scope = loadOutOfScopePolicy();

const ENTRY_CARNET: KnowledgeEntry = {
  id: 'kb-carnet',
  title: 'Solicitud de carnet estudiantil',
  content: 'El carnet se solicita en la oficina de registro presentando el documento de identidad.',
  validUntil: null
};
const ENTRY_EXPIRED: KnowledgeEntry = {
  id: 'kb-viejo',
  title: 'Horario de matricula 2025',
  content: 'La matricula se realiza en enero.',
  validUntil: new Date('2026-01-01T00:00:00Z')
};

const CONVOCATORIA: ConsolidatedMessageRecord = {
  sender: 'idiomas@upb.edu.co',
  subject: 'Convocatoria examen de suficiencia',
  body: 'Cierre: 30/09/2026.',
  firstSentAt: new Date('2026-09-01T10:00:00Z'),
  lastSentAt: new Date('2026-09-01T10:00:00Z'),
  resendCount: 0,
  dueDate: { kind: 'con-fecha', date: new Date('2026-09-30T05:00:00Z') },
  applicationLink: null,
  withdrawnAt: null
};
const CONVOCATORIA_ID = {
  sender: CONVOCATORIA.sender,
  subject: CONVOCATORIA.subject,
  firstSentAt: CONVOCATORIA.firstSentAt
};

async function build(script: (q: string) => ChatbotOutput | Promise<ChatbotOutput>, extraRecords: ConsolidatedMessageRecord[] = [CONVOCATORIA]) {
  const clock = new FixedClock(NOW);
  const knowledgeBase = new InMemoryKnowledgeBase(clock, [ENTRY_CARNET, ENTRY_EXPIRED]);
  const registry = new InMemoryConsolidatedMessageRegistry();
  for (const record of extraRecords) await registry.save(record);
  const chatbot = new StubChatbot((request) => script(request.question));
  const escalations = new InMemoryEscalationLog();
  const useCase = new AnswerStudentQuestion({
    chatbot,
    knowledgeBase,
    convocatorias: new RegistryConvocatoriaReference(registry),
    escalations,
    clock,
    officialChannel: channel,
    outOfScope: scope
  });
  return { useCase, chatbot, escalations, registry, knowledgeBase };
}

const kbAnswer = (): ChatbotOutput => ({
  text: 'El carnet se solicita en la oficina de registro.',
  sources: [{ kind: 'knowledge-entry', entryId: 'kb-carnet' }]
});

describe('AnswerStudentQuestion (HU-42)', () => {
  describe('criterio 1: toda respuesta indica su fuente', () => {
    it('entrega la respuesta con la entrada de la base de conocimiento de la que proviene', async () => {
      const { useCase } = await build(kbAnswer);
      const answer = await useCase.execute({ question: 'Como solicito mi carnet estudiantil?' });
      expect(answer).toEqual({
        kind: 'answered',
        text: 'El carnet se solicita en la oficina de registro.',
        sources: [{ kind: 'knowledge-entry', entryId: 'kb-carnet', title: 'Solicitud de carnet estudiantil' }]
      });
    });

    it('elimina fuentes repetidas', async () => {
      const { useCase } = await build(() => ({
        text: 'ok',
        sources: [
          { kind: 'knowledge-entry', entryId: 'kb-carnet' },
          { kind: 'knowledge-entry', entryId: 'kb-carnet' }
        ]
      }));
      const answer = await useCase.execute({ question: 'carnet estudiantil' });
      expect(answer.kind === 'answered' && answer.sources).toHaveLength(1);
    });

    it('una pregunta vacia no llega al modelo', async () => {
      const { useCase, chatbot } = await build(kbAnswer);
      expect(await useCase.execute({ question: '   ' })).toEqual({ kind: 'invalid-question' });
      expect(chatbot.requests).toHaveLength(0);
    });
  });

  describe('criterio 2: sin fuente identificable no se entrega y se escala', () => {
    it.each([
      ['sin fuentes', { text: 'Respuesta inventada', sources: [] }],
      ['texto vacio', { text: '  ', sources: [{ kind: 'knowledge-entry', entryId: 'kb-carnet' }] }],
      ['fuente inexistente', { text: 'x', sources: [{ kind: 'knowledge-entry', entryId: 'kb-fantasma' }] }],
      ['fuente vencida', { text: 'x', sources: [{ kind: 'knowledge-entry', entryId: 'kb-viejo' }] }],
      ['fuente de forma desconocida', { text: 'x', sources: [{ kind: 'wiki', id: 'a' }] }],
      ['salida sin forma', {}]
    ])('%s: no entrega el texto del modelo, escala y registra', async (_name, output) => {
      const { useCase, escalations } = await build(() => output as unknown as ChatbotOutput);
      const answer = await useCase.execute({ question: 'carnet estudiantil', studentId: 'est-1' });
      expect(answer.kind).toBe('escalated');
      expect(JSON.stringify(answer)).not.toContain('inventada');
      expect(answer.kind === 'escalated' && answer.reason).toBe('unanchored-response');
      expect(answer.kind === 'escalated' && answer.officialChannel).toEqual(channel);
      expect(escalations.records).toEqual([
        expect.objectContaining({ reason: 'unanchored-response', studentId: 'est-1', question: 'carnet estudiantil', at: NOW })
      ]);
    });

    it('una sola fuente inexistente entre varias validas invalida toda la respuesta', async () => {
      const { useCase } = await build(() => ({
        text: 'x',
        sources: [
          { kind: 'knowledge-entry', entryId: 'kb-carnet' },
          { kind: 'knowledge-entry', entryId: 'kb-fantasma' }
        ]
      }));
      expect((await useCase.execute({ question: 'carnet' })).kind).toBe('escalated');
    });

    it('si el proveedor falla, escala en vez de propagar el error o inventar', async () => {
      const { useCase, escalations } = await build(() => {
        throw new Error('timeout del proveedor');
      });
      const answer = await useCase.execute({ question: 'carnet' });
      expect(answer.kind === 'escalated' && answer.reason).toBe('provider-failure');
      expect(escalations.records[0]?.detail).toContain('timeout');
    });
  });

  describe('criterio 3: sin informacion suficiente lo declara e indica el canal oficial', () => {
    it('no consulta al modelo, declara la ausencia y cita el canal de config', async () => {
      const { useCase, chatbot, escalations } = await build(kbAnswer);
      const answer = await useCase.execute({ question: 'Cual es el reglamento de parqueaderos?' });
      expect(chatbot.requests).toHaveLength(0);
      expect(answer.kind).toBe('escalated');
      if (answer.kind !== 'escalated') return;
      expect(answer.reason).toBe('no-information');
      expect(answer.message).toContain('No tengo información suficiente');
      expect(answer.message).toContain(channel.name);
      expect(answer.message).toContain(channel.email as string);
      expect(escalations.records[0]?.reason).toBe('no-information');
    });

    it('una entrada vencida no cuenta como informacion', async () => {
      const { useCase } = await build(kbAnswer);
      const answer = await useCase.execute({ question: 'horario de matricula' });
      expect(answer.kind === 'escalated' && answer.reason).toBe('no-information');
    });
  });

  describe('criterio 4: la referencia a una convocatoria permite navegar a su detalle', () => {
    it('la fuente lleva el id completo de la convocatoria y su titulo', async () => {
      const { useCase } = await build(() => ({
        text: 'Hay un examen de suficiencia abierto.',
        sources: [{ kind: 'convocatoria', convocatoriaId: CONVOCATORIA_ID }]
      }));
      const answer = await useCase.execute({ question: 'carnet estudiantil y examen' });
      expect(answer.kind).toBe('answered');
      if (answer.kind !== 'answered') return;
      expect(answer.sources).toEqual([
        { kind: 'convocatoria', convocatoriaId: CONVOCATORIA_ID, title: 'Convocatoria examen de suficiencia' }
      ]);
    });

    it('una convocatoria inexistente o retirada no es fuente valida', async () => {
      const retirada = { ...CONVOCATORIA, withdrawnAt: NOW };
      const missing = await build(() => ({
        text: 'x',
        sources: [{ kind: 'convocatoria', convocatoriaId: { ...CONVOCATORIA_ID, subject: 'No existe' } }]
      }));
      expect((await missing.useCase.execute({ question: 'carnet' })).kind).toBe('escalated');
      const withdrawn = await build(
        () => ({ text: 'x', sources: [{ kind: 'convocatoria', convocatoriaId: CONVOCATORIA_ID }] }),
        [retirada]
      );
      expect((await withdrawn.useCase.execute({ question: 'carnet' })).kind).toBe('escalated');
    });
  });

  describe('criterio 5: fuera de alcance', () => {
    it.each([
      ['Cuales son mis notas de este semestre?', 'notas'],
      ['Quiero ver mi PROMEDIO académico', 'notas'],
      ['Cual es mi estado académico?', 'estado-academico'],
      ['cuantos creditos aprobados llevo', 'estado-academico']
    ])('"%s" se remite a la aplicacion institucional sin llamar al modelo', async (question, topicId) => {
      const { useCase, chatbot, escalations } = await build(kbAnswer);
      const answer = await useCase.execute({ question });
      expect(chatbot.requests).toHaveLength(0);
      expect(answer.kind).toBe('out-of-scope');
      if (answer.kind !== 'out-of-scope') return;
      expect(answer.topicId).toBe(topicId);
      expect(answer.message).toContain(scope.institutionalApp);
      expect(escalations.records).toHaveLength(0);
    });

    it('una pregunta dentro de alcance con palabra parecida no se excluye', async () => {
      const { useCase } = await build(kbAnswer);
      expect((await useCase.execute({ question: 'carnet notarial' })).kind).not.toBe('out-of-scope');
    });
  });

  describe('criterio 6: preguntas de prueba con respuesta conocida, ninguna cita una fuente inexistente', () => {
    const cases: Array<{ question: string; output: ChatbotOutput; expected: 'answered' | 'escalated' }> = [
      { question: 'como solicito el carnet', output: kbAnswer(), expected: 'answered' },
      {
        question: 'carnet y examen de suficiencia',
        output: { text: 'a', sources: [{ kind: 'convocatoria', convocatoriaId: CONVOCATORIA_ID }] },
        expected: 'answered'
      },
      { question: 'carnet alucinado', output: { text: 'a', sources: [{ kind: 'knowledge-entry', entryId: 'kb-x' }] }, expected: 'escalated' },
      {
        question: 'carnet con convocatoria falsa',
        output: {
          text: 'a',
          sources: [{ kind: 'convocatoria', convocatoriaId: { ...CONVOCATORIA_ID, sender: 'falso@upb.edu.co' } }]
        },
        expected: 'escalated'
      },
      { question: 'carnet sin cita', output: { text: 'a', sources: [] }, expected: 'escalated' }
    ];

    it('toda fuente entregada existe en el repositorio', async () => {
      for (const c of cases) {
        const { useCase, knowledgeBase, registry } = await build(() => c.output);
        const answer = await useCase.execute({ question: c.question });
        expect(answer.kind).toBe(c.expected);
        if (answer.kind !== 'answered') continue;
        for (const source of answer.sources) {
          if (source.kind === 'knowledge-entry') expect(await knowledgeBase.findById(source.entryId)).not.toBeNull();
          else expect(await registry.findById(source.convocatoriaId)).not.toBeNull();
        }
      }
    });
  });
});
