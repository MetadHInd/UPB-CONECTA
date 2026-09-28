import type { PracticeApplicationStatus, PracticeApplicationTracking } from '../../../../domain/entities/PracticeApplicationTracking.js';
import type { PracticeApplicationTrackingRepositoryPort } from '../../../../domain/ports/out/PracticeApplicationTrackingRepositoryPort.js';

function key(studentId: string, offerId: string): string {
  return `${studentId}|${offerId}`;
}

export class InMemoryPracticeApplicationTrackingRepository implements PracticeApplicationTrackingRepositoryPort {
  private readonly trackings = new Map<string, PracticeApplicationTracking>();

  async findByStudentAndOffer(studentId: string, offerId: string): Promise<PracticeApplicationTracking | null> {
    return this.trackings.get(key(studentId, offerId)) ?? null;
  }

  async findByStudent(studentId: string): Promise<readonly PracticeApplicationTracking[]> {
    return [...this.trackings.values()].filter((tracking) => tracking.studentId === studentId);
  }

  async save(tracking: PracticeApplicationTracking): Promise<void> {
    this.trackings.set(key(tracking.studentId, tracking.offerId), tracking);
  }

  async findTrackingStudents(
    offerIds: readonly string[],
    statuses: readonly PracticeApplicationStatus[]
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    const wanted = new Set(offerIds);
    const found = new Map<string, string[]>();
    for (const tracking of this.trackings.values()) {
      if (!wanted.has(tracking.offerId) || !statuses.includes(tracking.status)) continue;
      found.set(tracking.offerId, [...(found.get(tracking.offerId) ?? []), tracking.studentId]);
    }
    return found;
  }

  async deleteAllByStudent(studentId: string): Promise<number> {
    const owned = [...this.trackings.entries()].filter(([, tracking]) => tracking.studentId === studentId);
    for (const [trackingKey] of owned) this.trackings.delete(trackingKey);
    return owned.length;
  }
}
