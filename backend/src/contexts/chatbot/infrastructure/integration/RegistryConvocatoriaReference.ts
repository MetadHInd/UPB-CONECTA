import type { ConsolidatedMessageRegistryPort } from '../../../ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { ConvocatoriaId } from '../../../ingestion/domain/value-objects/ConvocatoriaId.js';
import type { ConvocatoriaReference, ConvocatoriaReferencePort } from '../../domain/ports/out/ConvocatoriaReferencePort.js';

/** Reutiliza la lectura por id del registro consolidado (la misma que usa el detalle, HU-15). */
export class RegistryConvocatoriaReference implements ConvocatoriaReferencePort {
  constructor(private readonly registry: ConsolidatedMessageRegistryPort) {}

  async find(id: ConvocatoriaId): Promise<ConvocatoriaReference | null> {
    const record = await this.registry.findById(id);
    return record === null ? null : { subject: record.subject, withdrawn: record.withdrawnAt !== null };
  }
}
