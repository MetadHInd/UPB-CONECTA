import type { LocalContentKind, LocalDataPurgePort } from '../../../../domain/ports/out/LocalDataPurgePort.js';

/**
 * Doble del almacenamiento local del cliente. El adaptador real vive en la
 * app Android (Room); aqui sirve para probar el caso de uso.
 */
export class InMemoryLocalDataPurge implements LocalDataPurgePort {
  private readonly content = new Map<LocalContentKind, unknown[]>();

  store(kind: LocalContentKind, items: unknown[]): void {
    this.content.set(kind, items);
  }

  count(kind: LocalContentKind): number {
    return this.content.get(kind)?.length ?? 0;
  }

  async purge(kinds: readonly LocalContentKind[]): Promise<void> {
    for (const kind of kinds) this.content.delete(kind);
  }
}
