import type { ConversationContextStorePort } from '../domain/ports/out/ConversationContextStorePort.js';

/**
 * HU-40 criterio 3: al cerrar la sesión, el contexto de la conversación se
 * descarta. Lo invoca el cierre de sesión de `identity` (`LogoutSession`, a
 * través de `SessionEndedPort`). Idempotente: cerrar una sesión sin
 * conversación no hace nada.
 */
export class EndChatbotConversation {
  constructor(private readonly dependencies: { readonly conversations: ConversationContextStorePort }) {}

  async execute(input: { readonly sessionId: string }): Promise<{ readonly discarded: boolean }> {
    return { discarded: await this.dependencies.conversations.discard(input.sessionId) };
  }
}
