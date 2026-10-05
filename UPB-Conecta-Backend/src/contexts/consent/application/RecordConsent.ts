import type { ConsentRecord } from '../domain/entities/ConsentRecord.js';
import type { RecordConsentCommand, RecordConsentPort } from '../domain/ports/in/RecordConsentPort.js';
import type { ConsentRepositoryPort } from '../domain/ports/out/ConsentRepositoryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';

export interface RecordConsentDependencies {
  readonly repository: ConsentRepositoryPort;
  readonly clock: ClockPort;
}

/**
 * HU-44, criterios 2 y 4: registra la aceptacion con fecha, hora y version.
 * `documentType` distingue politica de datos y normas del foro (criterio 4:
 * "se registra de forma independiente con su propia version") — son dos
 * historiales separados aunque compartan estudiante.
 */
export class RecordConsent implements RecordConsentPort {
  constructor(private readonly deps: RecordConsentDependencies) {}

  async execute(command: RecordConsentCommand): Promise<ConsentRecord> {
    const record: ConsentRecord = {
      studentId: command.studentId,
      documentType: command.documentType,
      version: command.version,
      acceptedAt: this.deps.clock.now()
    };
    await this.deps.repository.record(record);
    return record;
  }
}
