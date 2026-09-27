import type { Post } from '../../entities/Post.js';

export interface PostRepositoryPort {
  save(post: Post): Promise<void>;
  /** Mas reciente primero. */
  findById(id: string): Promise<Post | null>;
  /**
   * Oculta (`hiddenAt` con fecha) o vuelve a mostrar (`null`) una publicacion
   * (HU-34). Idempotente. No falla si la publicacion no existe.
   */
  setHidden(id: string, hiddenAt: Date | null): Promise<void>;
  findByTopic(topicId: string): Promise<readonly Post[]>;
  /** HU-48 (consulta): publicaciones del autor. `email` ya normalizado. Mas reciente primero. */
  findByAuthor(email: string): Promise<readonly Post[]>;
  /** HU-48 (supresion): borra las publicaciones del autor; devuelve cuantas. */
  deleteByAuthor(email: string): Promise<number>;
}
