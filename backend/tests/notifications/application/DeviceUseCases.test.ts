import { describe, it, expect } from 'vitest';
import { RegisterDevice } from '../../../src/contexts/notifications/application/RegisterDevice.js';
import { InvalidateDevice } from '../../../src/contexts/notifications/application/InvalidateDevice.js';
import { ListActiveDevices } from '../../../src/contexts/notifications/application/ListActiveDevices.js';
import { InMemoryDeviceRegistry } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/InMemoryDeviceRegistry.js';
import { FixedClock } from '../../../src/contexts/notifications/infrastructure/adapters/out/memory/SystemClock.js';

function buildUseCases(clock = new FixedClock(new Date('2026-01-01T10:00:00Z'))) {
  const registry = new InMemoryDeviceRegistry();
  return {
    registry,
    clock,
    registerDevice: new RegisterDevice({ registry, clock }),
    invalidateDevice: new InvalidateDevice({ registry, clock }),
    listActiveDevices: new ListActiveDevices({ registry })
  };
}

describe('Casos de uso de dispositivos (HU-18)', () => {
  it('criterio 1: registra un dispositivo nuevo asociado al estudiante', async () => {
    const { registerDevice, registry } = buildUseCases();
    await registerDevice.execute({ studentId: 'est-1', deviceToken: 'token-a' });

    const found = await registry.findByToken('token-a');
    expect(found).toEqual({
      studentId: 'est-1',
      deviceToken: 'token-a',
      status: 'active',
      registeredAt: new Date('2026-01-01T10:00:00Z'),
      updatedAt: new Date('2026-01-01T10:00:00Z'),
      invalidatedReason: null
    });
  });

  it('criterio 2: la rotacion de token actualiza el registro existente sin duplicar', async () => {
    const { registerDevice, registry } = buildUseCases();
    await registerDevice.execute({ studentId: 'est-1', deviceToken: 'token-viejo' });
    await registerDevice.execute({ studentId: 'est-1', deviceToken: 'token-nuevo', previousToken: 'token-viejo' });

    expect(await registry.findByToken('token-viejo')).toBeNull();
    const nuevo = await registry.findByToken('token-nuevo');
    expect(nuevo?.studentId).toBe('est-1');
    expect(nuevo?.status).toBe('active');
    expect(registry.size).toBe(1);
  });

  it('rotar un token que nunca se registro se comporta como un registro nuevo', async () => {
    const { registerDevice, registry } = buildUseCases();
    await registerDevice.execute({ studentId: 'est-1', deviceToken: 'token-a', previousToken: 'token-que-no-existe' });

    expect(await registry.findByToken('token-a')).not.toBeNull();
    expect(registry.size).toBe(1);
  });

  it('criterio 3: el cierre de sesion invalida el dispositivo y deja de contar como vigente', async () => {
    const { registerDevice, invalidateDevice, listActiveDevices } = buildUseCases();
    await registerDevice.execute({ studentId: 'est-1', deviceToken: 'token-a' });
    await invalidateDevice.execute({ deviceToken: 'token-a', reason: 'logout' });

    const activos = await listActiveDevices.execute({ studentId: 'est-1' });
    expect(activos).toHaveLength(0);
  });

  it('criterio 4: un aviso llega a todos los dispositivos vigentes del estudiante', async () => {
    const { registerDevice, listActiveDevices } = buildUseCases();
    await registerDevice.execute({ studentId: 'est-1', deviceToken: 'token-a' });
    await registerDevice.execute({ studentId: 'est-1', deviceToken: 'token-b' });
    await registerDevice.execute({ studentId: 'est-2', deviceToken: 'token-c' });

    const activos = await listActiveDevices.execute({ studentId: 'est-1' });
    expect(activos.map((d) => d.deviceToken).sort()).toEqual(['token-a', 'token-b']);
  });

  it('criterio 5: un fallo de entrega reportado por el proveedor depura el registro', async () => {
    const { registerDevice, invalidateDevice, registry } = buildUseCases();
    await registerDevice.execute({ studentId: 'est-1', deviceToken: 'token-a' });
    await invalidateDevice.execute({ deviceToken: 'token-a', reason: 'delivery-failed' });

    const found = await registry.findByToken('token-a');
    expect(found?.status).toBe('invalidated');
    expect(found?.invalidatedReason).toBe('delivery-failed');
  });
});
