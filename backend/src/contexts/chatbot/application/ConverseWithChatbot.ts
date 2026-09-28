import { maskPersonalData, type MaskedPersonIdentity } from '../../hardening/domain/services/PersonalDataMasking.js';
import { appendTurn, citedEntryIds, startConversation } from '../domain/entities/ChatbotConversation.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ConversationContextStorePort } from '../domain/ports/out/ConversationContextStorePort.js';
import type { AnswerStudentQuestion } from './AnswerStudentQuestion.js';
import type { ChatbotAnswer } from './ChatbotResults.js';

export interface ConverseWithChatbotInput {
  /** `sessionId` de la sesión autenticada (`VerifyAccessToken`): identifica la conversación sin identificar al estudiante. */
  readonly sessionId: string;
  readonly question: string;
  /**
   * Quién pregunta, solo para enmascarar su nombre, usuario e identificador
   * si los escribe en la pregunta (criterio 4). No se guarda ni se envía.
   */
  readonly asker?: MaskedPersonIdentity;
}

/**
 * HU-40 (RF-65, RF-69): pregunta en lenguaje natural dentro de una
 * conversación que conserva el contexto durante la sesión activa.
 *
 * - Criterio 1: la respuesta la construye `AnswerStudentQuestion` (HU-42) a
 *   partir de la base de conocimiento, con su invariante de anclaje.
 * - Criterio 2: los intercambios previos viajan al modelo y las entradas ya
 *   citadas siguen siendo contexto, así que "¿y hasta cuándo?" se entiende.
 * - Criterio 3: la conversación vive solo en memoria, se identifica con el
 *   `sessionId` y se descarta al cerrar la sesión (`EndChatbotConversation`)
 *   o tras `idleMs` sin actividad.
 * - Criterio 4: la pregunta se enmascara antes de guardarse o enviarse.
 * - Criterio 5: fuera de alcance o sin respuesta anclada, se aplica el
 *   escalamiento de HU-42. No se le pasa el estudiante: el registro de
 *   escalamiento queda sin identidad.
 * - Criterio 6: los mensajes propios están en español y el proveedor recibe
 *   `responseLanguage: 'es'`.
 */
export class ConverseWithChatbot {
  constructor(
    private readonly dependencies: {
      readonly answer: AnswerStudentQuestion;
      readonly conversations: ConversationContextStorePort;
      readonly clock: ClockPort;
      readonly idleMs: number;
    }
  ) {}

  async execute(input: ConverseWithChatbotInput): Promise<ChatbotAnswer> {
    const { answer, conversations, clock, idleMs } = this.dependencies;
    const sessionId = input.sessionId.trim();
    if (sessionId === '') throw new Error('La conversación exige la sesión autenticada.');

    const now = clock.now();
    // Primero se descarta lo inactivo (de esta y de las demás sesiones): lo que queda es contexto vigente.
    await conversations.discardIdleSince(new Date(now.getTime() - idleMs));
    const conversation = (await conversations.find(sessionId)) ?? startConversation(sessionId, now);

    const question = maskPersonalData(input.question.trim(), input.asker ?? null);
    const reply = await answer.execute({
      question,
      conversation: {
        history: conversation.turns.map((turn) => ({ question: turn.question, answer: turn.answer })),
        contextEntryIds: citedEntryIds(conversation)
      }
    });
    if (reply.kind === 'invalid-question') return reply;

    await conversations.save(
      appendTurn(conversation, {
        question,
        answer: reply.kind === 'answered' ? reply.text : null,
        citedEntryIds:
          reply.kind === 'answered' ? reply.sources.flatMap((source) => (source.kind === 'knowledge-entry' ? [source.entryId] : [])) : [],
        at: now
      })
    );
    return reply;
  }
}
