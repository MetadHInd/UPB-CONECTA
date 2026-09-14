import type { DeviceInvalidationReason } from '../../entities/DeviceRegistration.js';

export interface InvalidateDeviceCommand {
  readonly deviceToken: string;
  readonly reason: DeviceInvalidationReason;
}

export interface InvalidateDevicePort {
  execute(command: InvalidateDeviceCommand): Promise<void>;
}
