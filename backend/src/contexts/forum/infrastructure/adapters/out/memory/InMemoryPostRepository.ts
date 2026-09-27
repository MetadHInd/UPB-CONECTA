import type { Post } from '../../../../domain/entities/Post.js';
import type { PostRepositoryPort } from '../../../../domain/ports/out/PostRepositoryPort.js';

export class InMemoryPostRepository implements PostRepositoryPort {
  private posts: Post[] = [];

  async save(post: Post): Promise<void> {
    this.posts.push(structuredClone(post));
  }

  async findById(id: string): Promise<Post | null> {
    const found = this.posts.find((post) => post.id === id);
    return found === undefined ? null : structuredClone(found);
  }

  async setHidden(id: string, hiddenAt: Date | null): Promise<void> {
    this.posts = this.posts.map((post) => (post.id === id ? { ...post, hiddenAt } : post));
  }

  async findByAuthor(email: string): Promise<readonly Post[]> {
    return this.posts
      .filter((post) => post.author.email === email)
      .map((post) => structuredClone(post))
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }

  async deleteByAuthor(email: string): Promise<number> {
    const kept = this.posts.filter((post) => post.author.email !== email);
    const removed = this.posts.length - kept.length;
    this.posts.splice(0, this.posts.length, ...kept);
    return removed;
  }

  async findByTopic(topicId: string): Promise<readonly Post[]> {
    return this.posts
      .filter((post) => post.topicId === topicId)
      .map((post) => structuredClone(post))
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }
}
