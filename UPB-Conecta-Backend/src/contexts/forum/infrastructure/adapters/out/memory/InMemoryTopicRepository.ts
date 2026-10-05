import type { Topic } from '../../../../domain/entities/Topic.js';
import type { TopicRepositoryPort } from '../../../../domain/ports/out/TopicRepositoryPort.js';

export class InMemoryTopicRepository implements TopicRepositoryPort {
  private readonly topics = new Map<string, Topic>();

  async findById(id: string): Promise<Topic | null> {
    const topic = this.topics.get(id);
    return topic ? structuredClone(topic) : null;
  }

  async findAll(): Promise<readonly Topic[]> {
    return [...this.topics.values()].map((topic) => structuredClone(topic)).sort(byName);
  }

  async findActive(): Promise<readonly Topic[]> {
    return (await this.findAll()).filter((topic) => topic.status === 'active');
  }

  async create(topic: Topic): Promise<boolean> {
    if (this.topics.has(topic.id)) return false;
    this.topics.set(topic.id, structuredClone(topic));
    return true;
  }

  async update(topic: Topic): Promise<void> {
    this.topics.set(topic.id, structuredClone(topic));
  }
}

function byName(a: Topic, b: Topic): number {
  return a.name.localeCompare(b.name, 'es');
}
