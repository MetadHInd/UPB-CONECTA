import type { ConvocatoriaId } from '../../../../ingestion/domain/value-objects/ConvocatoriaId.js';

export interface ConvocatoriaReference {
  readonly subject: string;
  readonly withdrawn: boolean;
}

/** Lectura de convocatorias para anclar respuestas; se implementa sobre el registro consolidado de `ingestion`. */
export interface ConvocatoriaReferencePort {
  find(id: ConvocatoriaId): Promise<ConvocatoriaReference | null>;
}
