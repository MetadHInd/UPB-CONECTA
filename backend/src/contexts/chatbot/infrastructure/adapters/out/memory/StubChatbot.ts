import type { ChatbotOutput, ChatbotPort, ChatbotRequest } from '../../../../domain/ports/out/ChatbotPort.js';

/** Doble del proveedor de IA: el guion decide que devuelve (o si falla). */
export class StubChatbot implements ChatbotPort {
  readonly requests: ChatbotRequest[] = [];

  constructor(private readonly script: (request: ChatbotRequest) => ChatbotOutput | Promise<ChatbotOutput>) {}

  async generate(request: ChatbotRequest): Promise<ChatbotOutput> {
    this.requests.push(request);
    return this.script(request);
  }
}
