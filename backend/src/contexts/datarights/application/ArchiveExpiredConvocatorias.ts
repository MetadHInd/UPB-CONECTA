import { addDays, type RetentionPolicy } from '../domain/entities/RetentionPolicy.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { ConvocatoriaArchivePort, ConvocatoriaSourcePort } from '../domain/ports/out/ConvocatoriaArchivePorts.js';

export interface ArchiveSummary {
  readonly archived: number;
  readonly alreadyArchived: number;
  readonly notYetDue: number;
}

/**
 * Archivado de convocatorias vencidas (HU-48 criterio 6): una convocatoria se
 * archiva cuando pasaron `convocatoriaArchiveAfterDays` desde su fecha de
 * cierre (politica de retencion). Las que no tienen fecha concreta no vencen.
 * Es un trabajo periodico e idempotente.
 */
export class ArchiveExpiredConvocatorias {
  constructor(
    private readonly dependencies: {
      readonly source: ConvocatoriaSourcePort;
      readonly archive: ConvocatoriaArchivePort;
      readonly policy: RetentionPolicy;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(): Promise<ArchiveSummary> {
    const { source, archive, policy, clock } = this.dependencies;
    const now = clock.now();
    let archived = 0;
    let alreadyArchived = 0;
    let notYetDue = 0;

    for (const candidate of await source.findWithDueDate()) {
      if (candidate.dueAt === null) continue;
      if (addDays(candidate.dueAt, policy.convocatoriaArchiveAfterDays).getTime() > now.getTime()) {
        notYetDue += 1;
        continue;
      }
      const isNew = await archive.archive({ convocatoriaId: candidate.convocatoriaId, dueAt: candidate.dueAt, archivedAt: now });
      if (isNew) archived += 1;
      else alreadyArchived += 1;
    }
    return { archived, alreadyArchived, notYetDue };
  }
}
