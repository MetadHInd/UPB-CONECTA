import type {
  ConsolidatedMessageRecord,
  ConsolidatedMessageRegistryPort
} from '../../../../domain/ports/out/ConsolidatedMessageRegistryPort.js';

/**
 * Identidad de un grupo consolidado: remitente+asunto NO basta, porque dos
 * convocatorias con el mismo asunto separadas en el tiempo (fuera de
 * ventana, criterio 3) deben ser grupos distintos, no el mismo documento
 * sobrescrito. `firstSentAt` fija el grupo porque nunca cambia una vez
 * creado.
 */
function groupKey(sender: string, subject: string, firstSentAt: Date): string {
  return `${sender} ${subject} ${firstSentAt.getTime()}`;
}

export class InMemoryConsolidatedMessageRegistry implements ConsolidatedMessageRegistryPort {
  private readonly groups = new Map<string, ConsolidatedMessageRecord>();

  async findWithinWindow(
    sender: string,
    subject: string,
    referenceDate: Date,
    windowMs: number
  ): Promise<ConsolidatedMessageRecord | null> {
    for (const record of this.groups.values()) {
      if (record.sender !== sender || record.subject !== subject) continue;
      const elapsedMs = referenceDate.getTime() - record.lastSentAt.getTime();
      if (elapsedMs >= 0 && elapsedMs <= windowMs) return record;
    }
    return null;
  }

  async save(record: ConsolidatedMessageRecord): Promise<void> {
    this.groups.set(groupKey(record.sender, record.subject, record.firstSentAt), record);
  }

  get size(): number {
    return this.groups.size;
  }
}
