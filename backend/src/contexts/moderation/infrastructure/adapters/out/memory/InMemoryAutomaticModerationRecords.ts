import type { AutomaticModerationRecord, HumanModerationResolution } from '../../../../domain/entities/AutomaticModerationRecord.js';
import type { AutomaticModerationRecordPort } from '../../../../domain/ports/out/AutomaticModerationRecordPort.js';

export class InMemoryAutomaticModerationRecords implements AutomaticModerationRecordPort {
  readonly records: AutomaticModerationRecord[] = [];

  async record(entry: AutomaticModerationRecord): Promise<void> {
    this.records.push(structuredClone(entry));
  }

  async appendResolution(contentId: string, resolution: HumanModerationResolution): Promise<boolean> {
    let index = -1;
    this.records.forEach((entry, position) => {
      if (entry.contentId === contentId) index = position;
    });
    const latest = this.records[index];
    if (latest === undefined) return false;
    this.records[index] = { ...latest, resolutions: [...latest.resolutions, structuredClone(resolution)] };
    return true;
  }

  async findByContentId(contentId: string): Promise<readonly AutomaticModerationRecord[]> {
    return this.records.filter((entry) => entry.contentId === contentId).map((entry) => structuredClone(entry));
  }
}
