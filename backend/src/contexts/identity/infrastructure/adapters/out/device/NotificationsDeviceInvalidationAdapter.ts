import type { DeviceInvalidationPort } from '../../../../domain/ports/out/DeviceInvalidationPort.js';
import type { InvalidateDevicePort } from '../../../../../notifications/domain/ports/in/InvalidateDevicePort.js';
import type { DeviceRegistryPort } from '../../../../../notifications/domain/ports/out/DeviceRegistryPort.js';

/**
 * Implementa `DeviceInvalidationPort` de `identity` con `InvalidateDevice` de
 * `notifications` (HU-18, criterio 3). Verifica antes que el dispositivo sea
 * de la cuenta que cierra sesion: `InvalidateDevice` solo recibe el token del
 * dispositivo y no comprueba dueno. La cuenta se compara con el `subject` de
 * la sesion, que es el mismo identificador con que se registra el dispositivo.
 */
export class NotificationsDeviceInvalidationAdapter implements DeviceInvalidationPort {
  constructor(
    private readonly registry: DeviceRegistryPort,
    private readonly invalidateDevice: InvalidateDevicePort
  ) {}

  async invalidateForStudent(studentId: string, deviceToken: string): Promise<void> {
    const device = await this.registry.findByToken(deviceToken);
    if (device === null || device.studentId !== studentId || device.status === 'invalidated') return;
    await this.invalidateDevice.execute({ deviceToken, reason: 'logout' });
  }
}
