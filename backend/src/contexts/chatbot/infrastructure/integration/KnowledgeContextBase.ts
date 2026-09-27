import type { KnowledgeBasePort as AdministeredKnowledgeBasePort, KnowledgeSource } from '../../../knowledge/domain/ports/out/KnowledgeBasePort.js';
import type { KnowledgeEntry } from '../../domain/entities/KnowledgeEntry.js';
import type { KnowledgeBasePort } from '../../domain/ports/out/KnowledgeBasePort.js';

function toChatbotEntry(source: KnowledgeSource): KnowledgeEntry {
  // La vigencia en `knowledge` es retiro lógico: el puerto administrado solo devuelve entradas vigentes, así que no hay fin de vigencia.
  return { id: source.id, title: source.title, content: source.content, validUntil: null };
}

/**
 * Conecta HU-42 con HU-41: el chatbot lee la base de conocimiento que administra el backoffice
 * (`knowledge`) a través de su propia vista mínima. Sin caché: publicar o retirar una entrada se
 * refleja en la siguiente pregunta, sin redespliegue.
 */
export class KnowledgeContextBase implements KnowledgeBasePort {
  constructor(private readonly knowledge: AdministeredKnowledgeBasePort) {}

  async searchCurrent(query: string): Promise<KnowledgeEntry[]> {
    return (await this.knowledge.search(query)).map(toChatbotEntry);
  }

  async findById(id: string): Promise<KnowledgeEntry | null> {
    const source = await this.knowledge.findById(id);
    return source === null ? null : toChatbotEntry(source);
  }
}
