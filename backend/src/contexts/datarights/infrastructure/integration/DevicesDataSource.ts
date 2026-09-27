import type { DeviceRegistryPort } from '../../../notifications/domain/ports/out/DeviceRegistryPort.js';
import type { PersonalDataRecord } from '../../domain/entities/PersonalDataArea.js';
import type { PersonalDataSourcePort } from '../../domain/ports/out/PersonalDataSourcePort.js';

const VISIBLE_TOKEN_CHARACTERS = 6;

/**
 * Dispositivos registrados para avisos (HU-18). El token es dato personal bajo
 * custodia minima (RNF-20): la consulta muestra solo su final, suficiente para
 * que el titular reconozca el dispositivo sin exponer una credencial de envio.
 */
export class DevicesDataSource implements PersonalDataSourcePort {
  readonly area = 'devices' as const;

  constructor(private readonly devices: DeviceRegistryPort) {}

  async collect(subject: string): Promise<readonly PersonalDataRecord[]> {
    const found = await this.devices.findAllForStudent(subject);
    return found.map((device) => ({
      tokenEnding: device.deviceToken.slice(-VISIBLE_TOKEN_CHARACTERS),
      status: device.status,
      registeredAt: device.registeredAt,
      updatedAt: device.updatedAt
    }));
  }

  async erase(subject: string): Promise<number> {
    return this.devices.deleteAllForStudent(subject);
  }
}
