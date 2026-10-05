import type { Post } from '../../../../domain/entities/Post.js';
import type { PostRepositoryPort } from '../../../../domain/ports/out/PostRepositoryPort.js';

export class InMemoryPostRepository implements PostRepositoryPort {
  private readonly posts: Post[] = [];

  async save(post: Post): Promise<void> {
    this.posts.push(structuredClone(post));
  }

  async findByTopic(topicId: string): Promise<readonly Post[]> {
    return this.posts
      .filter((post) => post.topicId === topicId)
      .map((post) => structuredClone(post))
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }
}
