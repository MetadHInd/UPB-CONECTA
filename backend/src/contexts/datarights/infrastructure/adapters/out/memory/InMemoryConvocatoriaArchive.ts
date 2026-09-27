import type { ConvocatoriaArchivePort, ConvocatoriaArchiveRecord } from '../../../../domain/ports/out/ConvocatoriaArchivePorts.js';

export class InMemoryConvocatoriaArchive implements ConvocatoriaArchivePort {
  private readonly records = new Map<string, ConvocatoriaArchiveRecord>();

  async archive(record: ConvocatoriaArchiveRecord): Promise<boolean> {
    if (this.records.has(record.convocatoriaId)) return false;
    this.records.set(record.convocatoriaId, record);
    return true;
  }

  async findAll(): Promise<readonly ConvocatoriaArchiveRecord[]> {
    return [...this.records.values()];
  }
}
