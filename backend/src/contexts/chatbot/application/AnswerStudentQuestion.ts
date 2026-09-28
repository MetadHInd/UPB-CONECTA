import { maskPersonalData } from '../../hardening/domain/services/PersonalDataMasking.js';
import { CHATBOT_RESPONSE_LANGUAGE, type ChatbotHistoryTurn, type ChatbotOutput, type ChatbotPort } from '../domain/ports/out/ChatbotPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ConvocatoriaReferencePort } from '../domain/ports/out/ConvocatoriaReferencePort.js';
import type { EscalationLogPort, EscalationReason } from '../domain/ports/out/EscalationLogPort.js';
import type { KnowledgeBasePort } from '../domain/ports/out/KnowledgeBasePort.js';
import { isCurrentKnowledgeEntry, type KnowledgeEntry } from '../domain/entities/KnowledgeEntry.js';
import { anchorResponse } from '../domain/services/AnchoringPolicy.js';
import { detectOutOfScopeTopic } from '../domain/services/OutOfScopeDetector.js';
import type { OfficialChannel, OutOfScopePolicyConfig } from '../domain/value-objects/ChatbotConfig.js';
import type { AnchoredSource, ProposedSource } from '../domain/value-objects/SourceReference.js';
import type { ChatbotAnswer } from './ChatbotResults.js';

export interface AnswerStudentQuestionDependencies {
  readonly chatbot: ChatbotPort;
  readonly knowledgeBase: KnowledgeBasePort;
  readonly convocatorias: ConvocatoriaReferencePort;
  readonly escalations: EscalationLogPort;
  readonly clock: ClockPort;
  readonly officialChannel: OfficialChannel;
  readonly outOfScope: OutOfScopePolicyConfig;
}

interface QuestionInput {
  readonly question: string;
  readonly studentId?: string | null;
  /**
   * HU-40: contexto de la conversación activa. `history` viaja al modelo para
   * entender una pregunta de seguimiento; las entradas de `contextEntryIds`
   * (las citadas antes) se suman a las recuperadas, si siguen vigentes.
   */
  readonly conversation?: {
    readonly history: readonly ChatbotHistoryTurn[];
    readonly contextEntryIds: readonly string[];
  };
}

/**
 * HU-42: responde una pregunta del estudiante solo si la respuesta se puede
 * anclar a una fuente real del repositorio. La regla de no alucinacion es un
 * invariante aplicado sobre la salida del modelo (`anchorResponse`), no una
 * instruccion al proveedor: si el modelo falla, no cita, o cita algo que no
 * existe, la respuesta NO se entrega y se escala (fail-safe).
 *
 * Orden: alcance (antes del modelo) -> recuperacion de entradas vigentes
 * (sin ellas no se llama al modelo) -> generacion -> verificacion de fuentes.
 */
export class AnswerStudentQuestion {
  constructor(private readonly deps: AnswerStudentQuestionDependencies) {}

  async execute(input: QuestionInput): Promise<ChatbotAnswer> {
    const question = input.question.trim();
    if (question === '') return { kind: 'invalid-question' };

    const topic = detectOutOfScopeTopic(question, this.deps.outOfScope);
    if (topic !== null) {
      const app = this.deps.outOfScope.institutionalApp;
      return {
        kind: 'out-of-scope',
        topicId: topic.id,
        institutionalApp: app,
        message: `Consultar ${topic.label} corresponde a la ${app}. Desde aquí no tengo acceso a esa información.`
      };
    }

    const now = this.deps.clock.now();
    const current = await this.currentEntries(question, input.conversation?.contextEntryIds ?? [], now);
    if (current.length === 0) {
      return this.escalate(input, 'no-information', 'La base de conocimiento no tiene entradas vigentes para la pregunta.');
    }

    let output: ChatbotOutput;
    try {
      // HU-40 criterio 4: al proveedor no viaja ningún dato identificatorio, ni en la pregunta ni en el historial.
      output = await this.deps.chatbot.generate({
        question: maskPersonalData(question),
        entries: current,
        history: (input.conversation?.history ?? []).map((turn) => ({
          question: maskPersonalData(turn.question),
          answer: turn.answer
        })),
        responseLanguage: CHATBOT_RESPONSE_LANGUAGE
      });
    } catch (error) {
      return this.escalate(input, 'provider-failure', error instanceof Error ? error.message : String(error));
    }

    // La salida del modelo es no confiable: se tolera cualquier forma.
    const proposed: readonly ProposedSource[] = Array.isArray(output?.sources) ? output.sources : [];
    const text = typeof output?.text === 'string' ? output.text : '';
    const resolved = await Promise.all(proposed.map((source) => this.resolve(source, now)));
    const anchored = anchorResponse(text, resolved);
    if (!anchored.ok) return this.escalate(input, 'unanchored-response', anchored.reason);
    return { kind: 'answered', text, sources: anchored.sources };
  }

  /** Recuperadas para la pregunta más las citadas antes en la conversación, vigentes y sin repetir. */
  private async currentEntries(question: string, contextEntryIds: readonly string[], now: Date): Promise<KnowledgeEntry[]> {
    const [found, context] = await Promise.all([
      this.deps.knowledgeBase.searchCurrent(question),
      Promise.all(contextEntryIds.map((id) => this.deps.knowledgeBase.findById(id)))
    ]);
    const byId = new Map<string, KnowledgeEntry>();
    for (const entry of [...found, ...context]) {
      if (entry !== null && isCurrentKnowledgeEntry(entry, now) && !byId.has(entry.id)) byId.set(entry.id, entry);
    }
    return [...byId.values()];
  }

  private async resolve(source: ProposedSource, now: Date): Promise<AnchoredSource | null> {
    if (source?.kind === 'knowledge-entry' && typeof source.entryId === 'string') {
      const entry = await this.deps.knowledgeBase.findById(source.entryId);
      if (entry === null || !isCurrentKnowledgeEntry(entry, now)) return null;
      return { kind: 'knowledge-entry', entryId: entry.id, title: entry.title };
    }
    if (source?.kind === 'convocatoria' && source.convocatoriaId?.firstSentAt instanceof Date) {
      const found = await this.deps.convocatorias.find(source.convocatoriaId);
      if (found === null || found.withdrawn) return null;
      return { kind: 'convocatoria', convocatoriaId: source.convocatoriaId, title: found.subject };
    }
    return null;
  }

  private async escalate(input: QuestionInput, reason: EscalationReason, detail: string): Promise<ChatbotAnswer> {
    await this.deps.escalations.record({
      question: input.question.trim(),
      studentId: input.studentId ?? null,
      reason,
      detail,
      at: this.deps.clock.now()
    });
    const channel = this.deps.officialChannel;
    const contact = [channel.email, channel.phone, channel.url].filter((v): v is string => v !== null).join(' | ');
    const message =
      reason === 'no-information'
        ? `No tengo información suficiente para responder esto. Consulta el canal oficial: ${channel.name} (${contact}).`
        : `No pude darte una respuesta confiable. Consulta el canal oficial: ${channel.name} (${contact}).`;
    return { kind: 'escalated', reason, message, officialChannel: channel };
  }
}
