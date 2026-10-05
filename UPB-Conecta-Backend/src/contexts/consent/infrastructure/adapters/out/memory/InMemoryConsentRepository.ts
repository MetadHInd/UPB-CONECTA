import type { ConsentDocumentType, ConsentRecord } from '../../../../domain/entities/ConsentRecord.js';
import type { ConsentRepositoryPort } from '../../../../domain/ports/out/ConsentRepositoryPort.js';

function key(studentId: string, documentType: ConsentDocumentType): string {
  return `${studentId}|${documentType}`;
}

export class InMemoryConsentRepository implements ConsentRepositoryPort {
  private readonly records = new Map<string, ConsentRecord[]>();

  async record(consent: ConsentRecord): Promise<void> {
    const k = key(consent.studentId, consent.documentType);
    const existing = this.records.get(k) ?? [];
    existing.push(consent);
    this.records.set(k, existing);
  }

  async findLatest(studentId: string, documentType: ConsentDocumentType): Promise<ConsentRecord | null> {
    const history = await this.findHistory(studentId, documentType);
    return history[0] ?? null;
  }

  async findHistory(studentId: string, documentType: ConsentDocumentType): Promise<readonly ConsentRecord[]> {
    const existing = this.records.get(key(studentId, documentType)) ?? [];
    return [...existing].sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime());
  }

  get size(): number {
    return [...this.records.values()].reduce((total, list) => total + list.length, 0);
  }
}
