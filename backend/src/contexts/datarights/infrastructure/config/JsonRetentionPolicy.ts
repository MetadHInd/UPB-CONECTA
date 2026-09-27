import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RetentionPolicy } from '../../domain/entities/RetentionPolicy.js';

const DEFAULT_CONFIG_PATH = new URL('../../../../../config/data-retention-policy.json', import.meta.url);

export class InvalidRetentionPolicyError extends Error {
  constructor(motivo: string) {
    super(`Politica de retencion invalida: ${motivo}`);
    this.name = 'InvalidRetentionPolicyError';
  }
}

interface RetentionPolicyFile {
  readonly erasure?: { readonly deadlineDays?: unknown };
  readonly convocatoriaArchive?: { readonly afterDueDateDays?: unknown };
  readonly directoryCorrectionChannel?: { readonly name?: unknown; readonly instructions?: unknown };
  readonly retainedRecords?: readonly { readonly area?: unknown; readonly description?: unknown; readonly erasable?: unknown }[];
}

function positiveDays(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new InvalidRetentionPolicyError(`${name} debe ser un entero positivo de dias`);
  }
  return value;
}

function nonEmptyText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new InvalidRetentionPolicyError(`${name} es obligatorio`);
  return value;
}

/**
 * Mismo patron que `loadConsentRequiredOperationsCatalog` (HU-44): los plazos
 * y periodos viven en `config/data-retention-policy.json` y se validan al
 * cargar, para que un valor absurdo rompa el arranque y no la primera supresion.
 */
export function loadRetentionPolicy(configPath: string | URL = DEFAULT_CONFIG_PATH): RetentionPolicy {
  const resolvedPath = typeof configPath === 'string' ? configPath : fileURLToPath(configPath);
  const file = JSON.parse(readFileSync(resolvedPath, 'utf8')) as RetentionPolicyFile;

  return {
    erasureDeadlineDays: positiveDays(file.erasure?.deadlineDays, 'erasure.deadlineDays'),
    convocatoriaArchiveAfterDays: positiveDays(file.convocatoriaArchive?.afterDueDateDays, 'convocatoriaArchive.afterDueDateDays'),
    directoryCorrectionChannel: {
      name: nonEmptyText(file.directoryCorrectionChannel?.name, 'directoryCorrectionChannel.name'),
      instructions: nonEmptyText(file.directoryCorrectionChannel?.instructions, 'directoryCorrectionChannel.instructions')
    },
    retainedRecords: (file.retainedRecords ?? []).map((entry, index) => ({
      area: nonEmptyText(entry.area, `retainedRecords[${index}].area`),
      description: nonEmptyText(entry.description, `retainedRecords[${index}].description`),
      erasable: entry.erasable === true
    }))
  };
}
