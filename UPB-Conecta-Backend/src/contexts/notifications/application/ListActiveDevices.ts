import type { DeviceRegistration } from '../domain/entities/DeviceRegistration.js';
import type { ListActiveDevicesPort, ListActiveDevicesQuery } from '../domain/ports/in/ListActiveDevicesPort.js';
import type { DeviceRegistryPort } from '../domain/ports/out/DeviceRegistryPort.js';

export interface ListActiveDevicesDependencies {
  readonly registry: DeviceRegistryPort;
}

/**
 * HU-18, criterio 4: el abanico de destinos vigentes de un estudiante para
 * un aviso. El envio real (HU-20/21, via un futuro `PushProviderPort`) no
 * es responsabilidad de esta historia — HU-18 solo garantiza que la lista
 * de destinos este correcta.
 */
export class ListActiveDevices implements ListActiveDevicesPort {
  constructor(private readonly deps: ListActiveDevicesDependencies) {}

  async execute(query: ListActiveDevicesQuery): Promise<readonly DeviceRegistration[]> {
    return this.deps.registry.findActiveForStudent(query.studentId);
  }
}
