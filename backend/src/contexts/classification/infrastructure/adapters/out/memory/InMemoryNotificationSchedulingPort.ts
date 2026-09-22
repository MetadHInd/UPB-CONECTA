import type { ClassificationResultRecord } from '../../../../domain/entities/ClassificationResult.js';
import type { NotificationSchedulingPort } from '../../../../domain/ports/out/NotificationSchedulingPort.js';

/**
 * Stub explicito y documentado (HU-10, gap 2): el contexto `notifications` no
 * tiene todavia ningun caso de uso de "enviar"/"programar" contenido nuevo.
 * Este adaptador solo registra la llamada (para pruebas y como marcador de
 * produccion), sin plantillas, contenido ni entrega push.
 *
 * TODO: conectar con el caso de uso real de programacion de notificaciones cuando exista.
 */
export class InMemoryNotificationSchedulingPort implements NotificationSchedulingPort {
  readonly scheduled: ClassificationResultRecord[] = [];

  async scheduleForPublication(record: ClassificationResultRecord): Promise<void> {
    this.scheduled.push(record);
  }
}
