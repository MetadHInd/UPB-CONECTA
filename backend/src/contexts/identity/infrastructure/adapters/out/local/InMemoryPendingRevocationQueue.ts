import type { PendingRevocation } from '../../../../domain/entities/PendingRevocation.js';
import type { PendingRevocationQueuePort } from '../../../../domain/ports/out/PendingRevocationQueuePort.js';

/** Doble de la cola durable del cliente (en Android, una tabla Room / almacenamiento seguro). */
export class InMemoryPendingRevocationQueue implements PendingRevocationQueuePort {
  private items: PendingRevocation[] = [];

  async enqueue(item: PendingRevocation): Promise<void> {
    this.items.push(item);
  }

  async list(): Promise<readonly PendingRevocation[]> {
    return [...this.items];
  }

  async remove(item: PendingRevocation): Promise<void> {
    this.items = this.items.filter((candidate) => candidate !== item);
  }
}
