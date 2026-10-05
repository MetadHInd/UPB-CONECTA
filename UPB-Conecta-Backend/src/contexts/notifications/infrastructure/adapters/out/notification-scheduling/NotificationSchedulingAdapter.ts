import type { NotificationSchedulingPort } from '../../../../../classification/domain/ports/out/NotificationSchedulingPort.js';
import type { ClassificationResultRecord } from '../../../../../classification/domain/entities/ClassificationResult.js';
import { NotifyProgramTargetedPublication } from '../../../../application/NotifyProgramTargetedPublication.js';

/**
 * HU-20: implementacion real de `NotificationSchedulingPort` (el puerto que
 * `classification` declaro en HU-10 explicitamente como "stub de HU-20", ver
 * su propia documentacion). Vive en la infraestructura de `notifications`,
 * nunca en `classification` ni en `ingestion`: son esos contextos los que
 * declaran y llaman el puerto, este es quien lo implementa — mismo sentido
 * de dependencia que `ConsentStatusAdapter` (`identity` declara, `consent`
 * implementa a traves de un adaptador de `identity`) pero en espejo: aqui
 * `classification` declara y `notifications` implementa.
 *
 * Sustituye a `InMemoryNotificationSchedulingPort` (que se conserva para
 * pruebas de `classification`/`ingestion` que no necesitan un planificador
 * real) en la raiz de composicion (`main.ts`).
 */
export class NotificationSchedulingAdapter implements NotificationSchedulingPort {
  constructor(private readonly notify: NotifyProgramTargetedPublication) {}

  async scheduleForPublication(record: ClassificationResultRecord): Promise<void> {
    // Defensivo: los tres puntos de entrada que invocan este puerto
    // (`ClassifyInstitutionalMessage`, `CorrectClassification`,
    // `PublishConvocatoria`) solo lo hacen cuando el registro ya quedo
    // publicado (ver documentacion de `NotifyProgramTargetedPublication`),
    // pero la invariante se deja explicita aqui en vez de asumida.
    if (record.publicationStatus !== 'published') return;
    await this.notify.execute({ messageId: record.messageId, category: record.finalCategory });
  }

  async cancelScheduledNotifications(_messageId: string): Promise<void> {
    // HU-20 no deja ningun aviso "programado" con estado propio que cancelar:
    // `NotifyProgramTargetedPublication` resuelve y produce los
    // `PendingNotification` de inmediato al publicarse la convocatoria, no
    // agenda timers por mensaje. El aviso de vencimiento (HU-19) tampoco
    // necesita cancelacion explicita: `EmitDueDateReminders` relee el estado
    // vigente (incluido `withdrawnAt`) en cada ciclo del poller y deja de
    // producir avisos para una convocatoria retirada sin que nadie se lo
    // pida — ver criterio 4 de HU-19. No-op documentado, no ausencia de
    // manejo.
  }
}
