import type { ChatbotOutput, ChatbotPort, ChatbotRequest } from '../../../../domain/ports/out/ChatbotPort.js';

/**
 * Proveedor del chatbot sin modelo de lenguaje: responde con el contenido de
 * la entrada de la base de conocimiento mas relevante y la cita como fuente
 * (RF-65, RF-67). No inventa texto: si no hay entradas devuelve una respuesta
 * sin fuentes y `AnswerStudentQuestion` la descarta y escala (RF-68). Sin
 * estado, a diferencia de `StubChatbot`, que conserva cada peticion para las
 * pruebas. Sustituible por un proveedor de IA detras del mismo puerto.
 */
export class ExtractiveChatbot implements ChatbotPort {
  async generate(request: ChatbotRequest): Promise<ChatbotOutput> {
    const best = request.entries[0];
    if (best === undefined) return { text: '', sources: [] };
    return { text: best.content, sources: [{ kind: 'knowledge-entry', entryId: best.id }] };
  }
}
