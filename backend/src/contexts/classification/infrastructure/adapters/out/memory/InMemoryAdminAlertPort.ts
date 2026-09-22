import type { ClassificationResultRecord } from '../../../../domain/entities/ClassificationResult.js';
import type { AdminAlertPort } from '../../../../domain/ports/out/AdminAlertPort.js';

/**
 * Stub explicito y documentado (HU-10, gap 2), igual que `InMemoryClassificationAdapter`
 * de HU-06: no existe todavia ningun mecanismo real de alertas al
 * administrador en este repositorio. Se usa tanto en pruebas como en
 * producción hasta que exista, siguiendo el mismo patron ya establecido para
 * `InMemoryMailboxAdapter` en `main.ts`.
 *
 * TODO: conectar con el mecanismo real de alertas al administrador cuando exista.
 */
export class InMemoryAdminAlertPort implements AdminAlertPort {
  readonly alerts: ClassificationResultRecord[] = [];

  async notifyPendingReview(record: ClassificationResultRecord): Promise<void> {
    this.alerts.push(record);
  }
}
