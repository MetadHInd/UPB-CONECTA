import type { ConsolidatedMessageRecord } from '../../../../ingestion/domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { IdentityProfile } from '../../../../identity/domain/entities/IdentityProfile.js';

export interface FeedQueryOptions {
  readonly limit?: number | undefined;
  readonly since?: Date | null;
}

export interface ConvocatoriaEntry {
  readonly id: string; // convocatoria id string
  readonly record: ConsolidatedMessageRecord;
}

export interface ConvocatoriaRepositoryPort {
  findSegmentedFeed(profile: IdentityProfile, options?: FeedQueryOptions): Promise<ConvocatoriaEntry[]>;
}

export const ConvocatoriaRepositoryPortName = 'ConvocatoriaRepositoryPort';
