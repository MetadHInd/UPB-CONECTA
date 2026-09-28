import type { SessionEndedPort } from '../../../../domain/ports/out/SessionEndedPort.js';
import type { EndChatbotConversation } from '../../../../../chatbot/application/EndChatbotConversation.js';

/**
 * Implementa `SessionEndedPort` de `identity` con `EndChatbotConversation`
 * (HU-40, criterio 3): cerrar la sesión descarta el contexto de la
 * conversación del chatbot. El `sessionId` es la cadena de la sesión, el
 * mismo que `VerifyAccessToken` entrega como identificador de la conversación.
 */
export class ChatbotConversationSessionEndedAdapter implements SessionEndedPort {
  constructor(private readonly endConversation: EndChatbotConversation) {}

  async sessionEnded(sessionId: string): Promise<void> {
    await this.endConversation.execute({ sessionId });
  }
}
