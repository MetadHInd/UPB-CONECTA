import type { EmittedReminderRegistryPort } from '../../../../domain/ports/out/EmittedReminderRegistryPort.js';

function key(studentId: string, convocatoriaId: string, thresholdMinutes: number, dueAtEpochMs: number): string {
  return `${studentId}|${convocatoriaId}|${thresholdMinutes}|${dueAtEpochMs}`;
}

export class InMemoryEmittedReminderRegistry implements EmittedReminderRegistryPort {
  private readonly emitted = new Set<string>();

  async wasEmitted(studentId: string, convocatoriaId: string, thresholdMinutes: number, dueAtEpochMs: number): Promise<boolean> {
    return this.emitted.has(key(studentId, convocatoriaId, thresholdMinutes, dueAtEpochMs));
  }

  async markEmitted(
    studentId: string,
    convocatoriaId: string,
    thresholdMinutes: number,
    dueAtEpochMs: number
  ): Promise<void> {
    this.emitted.add(key(studentId, convocatoriaId, thresholdMinutes, dueAtEpochMs));
  }

  get size(): number {
    return this.emitted.size;
  }
}
