import type { InvalidateDeviceCommand, InvalidateDevicePort } from '../domain/ports/in/InvalidateDevicePort.js';
import type { DeviceRegistryPort } from '../domain/ports/out/DeviceRegistryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';

export interface InvalidateDeviceDependencies {
  readonly registry: DeviceRegistryPort;
  readonly clock: ClockPort;
}

/**
 * HU-18, criterios 3 y 5: un cierre de sesion y un fallo de entrega
 * reportado por el proveedor push llegan al mismo lugar del dominio — en
 * ambos casos el dispositivo deja de ser un destino vigente. `reason` solo
 * se conserva para diagnostico/auditoria, la invalidacion es identica.
 */
export class InvalidateDevice implements InvalidateDevicePort {
  constructor(private readonly deps: InvalidateDeviceDependencies) {}

  async execute(command: InvalidateDeviceCommand): Promise<void> {
    await this.deps.registry.invalidate(command.deviceToken, command.reason, this.deps.clock.now());
  }
}
