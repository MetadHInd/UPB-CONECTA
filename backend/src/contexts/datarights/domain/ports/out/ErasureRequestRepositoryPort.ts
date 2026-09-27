import type { ErasureRequest } from '../../entities/ErasureRequest.js';

export interface ErasureRequestRepositoryPort {
  /** Upsert por `id`. */
  save(request: ErasureRequest): Promise<void>;
  findById(id: string): Promise<ErasureRequest | null>;
  /** Solicitud aun pendiente del titular, para que repetir la peticion no abra otra. */
  findPendingBySubject(subject: string): Promise<ErasureRequest | null>;
  findPending(): Promise<readonly ErasureRequest[]>;
}
