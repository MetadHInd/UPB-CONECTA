import type { Collection, Db } from 'mongodb';
import type { Conversation, ConversationSummary, Message, Participant } from '../../../../domain/entities/Conversation.js';
import type { ConversationRepositoryPort } from '../../../../domain/ports/out/ConversationRepositoryPort.js';

interface ConversationDocument {
  _id: string;
  professor: Participant;
  student: Participant;
  subject: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Conversaciones en `messaging_conversations`, con los mensajes embebidos:
 * una conversacion 1 a 1 entre profesor y estudiante no crece lo suficiente
 * como para justificar una coleccion aparte, y asi leer el historial es una
 * sola consulta.
 */
export class MongoConversationRepository implements ConversationRepositoryPort {
  static readonly COLLECTION = 'messaging_conversations';

  private readonly collection: Collection<ConversationDocument>;

  constructor(db: Db, collectionName = MongoConversationRepository.COLLECTION) {
    this.collection = db.collection<ConversationDocument>(collectionName);
  }

  /** Una bandeja por rol: cada indice sirve el filtro de un participante, mas reciente primero. */
  static async ensureIndexes(db: Db, collectionName = MongoConversationRepository.COLLECTION): Promise<void> {
    const collection = db.collection(collectionName);
    await collection.createIndex({ 'professor.email': 1, updatedAt: -1 }, { name: 'idx_professor_updated' });
    await collection.createIndex({ 'student.email': 1, updatedAt: -1 }, { name: 'idx_student_updated' });
  }

  async save(conversation: Conversation): Promise<void> {
    const { id, messages, ...rest } = conversation;
    await this.collection.insertOne({ _id: id, messages: [...messages], ...rest });
  }

  async findById(id: string): Promise<Conversation | null> {
    const doc = await this.collection.findOne({ _id: id });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
  }

  async findSummariesByParticipant(email: string): Promise<readonly ConversationSummary[]> {
    const docs = await this.collection
      .find(
        { $or: [{ 'professor.email': email }, { 'student.email': email }] },
        { projection: { messages: { $slice: -1 } } }
      )
      .sort({ updatedAt: -1 })
      .toArray();
    return docs.map(({ _id, messages, ...rest }) => ({ id: _id, ...rest, lastMessage: messages[0] ?? null }));
  }

  async appendMessage(conversationId: string, message: Message): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: conversationId },
      { $push: { messages: message }, $set: { updatedAt: message.sentAt } }
    );
    return result.matchedCount === 1;
  }
}
