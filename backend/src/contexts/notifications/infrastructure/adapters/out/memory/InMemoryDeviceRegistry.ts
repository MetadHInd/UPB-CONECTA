import type { DeviceInvalidationReason, DeviceRegistration } from '../../../../domain/entities/DeviceRegistration.js';
import type { DeviceRegistryPort } from '../../../../domain/ports/out/DeviceRegistryPort.js';

export class InMemoryDeviceRegistry implements DeviceRegistryPort {
  private readonly devices = new Map<string, DeviceRegistration>();

  async register(studentId: string, deviceToken: string, at: Date): Promise<void> {
    const existing = this.devices.get(deviceToken);
    this.devices.set(deviceToken, {
      studentId,
      deviceToken,
      status: 'active',
      registeredAt: existing?.registeredAt ?? at,
      updatedAt: at,
      invalidatedReason: null
    });
  }

  async rotateToken(previousToken: string, newToken: string, at: Date): Promise<void> {
    const existing = this.devices.get(previousToken);
    if (existing === undefined) return;
    this.devices.delete(previousToken);
    this.devices.set(newToken, { ...existing, deviceToken: newToken, status: 'active', updatedAt: at, invalidatedReason: null });
  }

  async invalidate(deviceToken: string, reason: DeviceInvalidationReason, at: Date): Promise<void> {
    const existing = this.devices.get(deviceToken);
    if (existing === undefined) return;
    this.devices.set(deviceToken, { ...existing, status: 'invalidated', updatedAt: at, invalidatedReason: reason });
  }

  async findByToken(deviceToken: string): Promise<DeviceRegistration | null> {
    return this.devices.get(deviceToken) ?? null;
  }

  async findActiveForStudent(studentId: string): Promise<readonly DeviceRegistration[]> {
    return [...this.devices.values()].filter((d) => d.studentId === studentId && d.status === 'active');
  }

  get size(): number {
    return this.devices.size;
  }
}
