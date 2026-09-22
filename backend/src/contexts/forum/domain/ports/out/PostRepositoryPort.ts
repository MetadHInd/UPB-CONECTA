import type { Post } from '../../entities/Post.js';

export interface PostRepositoryPort {
  save(post: Post): Promise<void>;
  /** Mas reciente primero. */
  findByTopic(topicId: string): Promise<readonly Post[]>;
}
