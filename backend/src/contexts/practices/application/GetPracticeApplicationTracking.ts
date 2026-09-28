import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import type { PracticeApplicationTrackingRepositoryPort } from '../domain/ports/out/PracticeApplicationTrackingRepositoryPort.js';
import type { PracticeConvocatoriaSnapshot, PracticeConvocatoriaSourcePort } from '../domain/ports/out/PracticeConvocatoriaSourcePort.js';
import { groupTrackedApplications, type PracticeApplicationGroup } from '../domain/services/PracticeTrackingPolicy.js';

export interface PracticeApplicationTrackingView {
  readonly groups: readonly PracticeApplicationGroup[];
  readonly total: number;
}

/**
 * HU-23, criterios 5 y 6: la vista de seguimiento del estudiante, agrupada
 * por estado. Cada postulacion trae como esta hoy la oferta; una retirada o
 * que ya no figura sigue en la vista con un aviso que explica el cambio, en
 * vez de desaparecer.
 *
 * Solo lee el seguimiento del estudiante de la sesion (criterio 4). Resuelve
 * las ofertas en lote con la misma fuente del listado de HU-22, que tambien
 * entrega las retiradas.
 */
export class GetPracticeApplicationTracking {
  constructor(
    private readonly dependencies: {
      readonly trackings: PracticeApplicationTrackingRepositoryPort;
      readonly source: PracticeConvocatoriaSourcePort;
      readonly clock: ClockPort;
    }
  ) {}

  async execute(query: { readonly studentId: string }): Promise<PracticeApplicationTrackingView> {
    const { trackings, source, clock } = this.dependencies;
    const tracked = await trackings.findByStudent(query.studentId);
    if (tracked.length === 0) return { groups: groupTrackedApplications([], new Map(), clock.now()), total: 0 };

    const wanted = new Set(tracked.map((tracking) => tracking.offerId));
    const snapshots = new Map<string, PracticeConvocatoriaSnapshot>();
    for (const snapshot of await source.findPracticeConvocatorias()) {
      if (wanted.has(snapshot.messageId)) snapshots.set(snapshot.messageId, snapshot);
    }
    return { groups: groupTrackedApplications(tracked, snapshots, clock.now()), total: tracked.length };
  }
}
