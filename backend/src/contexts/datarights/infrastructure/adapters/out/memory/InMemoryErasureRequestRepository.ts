import type { ErasureRequest } from '../../../../domain/entities/ErasureRequest.js';
import type { ErasureRequestRepositoryPort } from '../../../../domain/ports/out/ErasureRequestRepositoryPort.js';

export class InMemoryErasureRequestRepository implements ErasureRequestRepositoryPort {
  private readonly requests = new Map<string, ErasureRequest>();

  async save(request: ErasureRequest): Promise<void> {
    this.requests.set(request.id, structuredClone(request));
  }

  async findById(id: string): Promise<ErasureRequest | null> {
    const found = this.requests.get(id);
    return found === undefined ? null : structuredClone(found);
  }

  async findPendingBySubject(subject: string): Promise<ErasureRequest | null> {
    const found = [...this.requests.values()].find((r) => r.status === 'pending' && r.subject === subject);
    return found === undefined ? null : structuredClone(found);
  }

  async findPending(): Promise<readonly ErasureRequest[]> {
    return [...this.requests.values()].filter((r) => r.status === 'pending').map((r) => structuredClone(r));
  }

  /** Para inspeccionar en pruebas que la solicitud completada no conserva al titular. */
  all(): readonly ErasureRequest[] {
    return [...this.requests.values()].map((r) => structuredClone(r));
  }
}
