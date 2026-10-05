import type { DeviceRegistration } from '../../entities/DeviceRegistration.js';

export interface ListActiveDevicesQuery {
  readonly studentId: string;
}

export interface ListActiveDevicesPort {
  execute(query: ListActiveDevicesQuery): Promise<readonly DeviceRegistration[]>;
}
