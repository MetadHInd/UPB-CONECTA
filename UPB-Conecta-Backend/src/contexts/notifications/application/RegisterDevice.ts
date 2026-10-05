import type { RegisterDeviceCommand, RegisterDevicePort } from '../domain/ports/in/RegisterDevicePort.js';
import type { DeviceRegistryPort } from '../domain/ports/out/DeviceRegistryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';

export interface RegisterDeviceDependencies {
  readonly registry: DeviceRegistryPort;
  readonly clock: ClockPort;
}

/**
 * HU-18, criterios 1 y 2: registra un dispositivo nuevo, o si el proveedor
 * roto el identificador (`previousToken` presente), actualiza el registro
 * existente en el mismo lugar en vez de crear uno duplicado. Si el token
 * anterior no existe (nunca se registro, o ya se habia depurado), el
 * resultado es equivalente a un registro nuevo.
 */
export class RegisterDevice implements RegisterDevicePort {
  constructor(private readonly deps: RegisterDeviceDependencies) {}

  async execute(command: RegisterDeviceCommand): Promise<void> {
    const { registry, clock } = this.deps;
    const now = clock.now();

    if (command.previousToken !== undefined) {
      const existing = await registry.findByToken(command.previousToken);
      if (existing !== null) {
        await registry.rotateToken(command.previousToken, command.deviceToken, now);
        return;
      }
    }

    await registry.register(command.studentId, command.deviceToken, now);
  }
}
