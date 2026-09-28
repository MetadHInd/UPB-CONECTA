/**
 * Un intercambio de la conversación. `question` ya está enmascarada: el
 * contexto nunca guarda datos identificatorios (criterio 4). `answer` es
 * `null` cuando el chatbot no respondió (escalamiento o fuera de alcance).
 */
export interface ConversationTurn {
  readonly question: string;
  readonly answer: string | null;
  /** Entradas de la base de conocimiento citadas en la respuesta; siguen siendo contexto en la pregunta siguiente. */
  readonly citedEntryIds: readonly string[];
  readonly at: Date;
}

/**
 * HU-40 (RF-65, RF-69): contexto conversacional de la sesión activa. Es
 * efímero: vive en memoria mientras dure la sesión y se descarta al cerrarla
 * o tras un tiempo sin actividad (criterio 3).
 *
 * Se identifica con el `sessionId` de la sesión autenticada (`identity`,
 * HU-43), que es opaco: la conversación no guarda el correo ni ningún otro
 * dato de la identidad del estudiante y no forma parte de su perfil (RNF-20).
 */
export interface ChatbotConversation {
  readonly sessionId: string;
  readonly turns: readonly ConversationTurn[];
  readonly startedAt: Date;
  readonly lastActivityAt: Date;
}

/**
 * Intercambios que se conservan como contexto. Suficiente para una pregunta
 * de seguimiento y acota lo que viaja al proveedor en cada consulta.
 */
export const MAX_CONVERSATION_TURNS = 6;

/** 30 minutos sin actividad cierran la conversación aunque la sesión siga abierta. */
export const DEFAULT_CONVERSATION_IDLE_MS = 30 * 60_000;

export function startConversation(sessionId: string, now: Date): ChatbotConversation {
  return { sessionId, turns: [], startedAt: now, lastActivityAt: now };
}

export function appendTurn(conversation: ChatbotConversation, turn: ConversationTurn): ChatbotConversation {
  return { ...conversation, turns: [...conversation.turns, turn].slice(-MAX_CONVERSATION_TURNS), lastActivityAt: turn.at };
}

/** Entradas citadas en la conversación, sin repetir, la más reciente primero. */
export function citedEntryIds(conversation: ChatbotConversation): string[] {
  return [...new Set([...conversation.turns].reverse().flatMap((turn) => turn.citedEntryIds))];
}
