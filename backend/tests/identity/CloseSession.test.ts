import { describe, expect, it } from 'vitest';
import { CloseSession } from '../../src/contexts/identity/application/CloseSession.js';
import { RetryPendingRevocations } from '../../src/contexts/identity/application/RetryPendingRevocations.js';
import { SessionFailureKind } from '../../src/contexts/identity/domain/entities/SessionResult.js';
import type { LocalDataPurgePort } from '../../src/contexts/identity/domain/ports/out/LocalDataPurgePort.js';
import type { RemoteSessionClosurePort } from '../../src/contexts/identity/domain/ports/out/RemoteSessionClosurePort.js';
import { InMemoryLocalDataPurge } from '../../src/contexts/identity/infrastructure/adapters/out/local/InMemoryLocalDataPurge.js';
import { InMemoryPendingRevocationQueue } from '../../src/contexts/identity/infrastructure/adapters/out/local/InMemoryPendingRevocationQueue.js';
import { InProcessRemoteSessionClosure } from '../../src/contexts/identity/infrastructure/adapters/out/local/InProcessRemoteSessionClosure.js';
import { buildSessionHarness, login, STUDENT } from './sessionHarness.js';

const ORIGIN = '10.0.0.1';
const DEVICE = 'device-token-a';

async function setup() {
  const harness = buildSessionHarness();
  const localData = new InMemoryLocalDataPurge();
  localData.store('feed', [1, 2, 3]);
  localData.store('offline-map', [1]);
  localData.store('application-status', [1, 2]);
  const remote = new InProcessRemoteSessionClosure(harness.logout);
  const pending = new InMemoryPendingRevocationQueue();
  const closeSession = new CloseSession({ localData, remote, pending, clock: harness.clock });
  const retry = new RetryPendingRevocations({ remote, pending });
  await harness.deviceRegistry.register(STUDENT.username, DEVICE, harness.clock.now());
  const session = await login(harness);
  return { harness, localData, remote, pending, closeSession, retry, session };
}

describe('HU-39 — cierre de sesión con revocación, baja de dispositivo y purga local (RF-64, RF-72, RF-26, RNF-17)', () => {
  it('criterios 1 y 4: el token de acceso se revoca en el servidor y se rechaza en peticiones posteriores', async () => {
    const { harness, closeSession, session } = await setup();
    const before = await harness.verifyAccess.execute({ accessToken: session.accessToken.value, origin: ORIGIN });
    expect(before.ok).toBe(true);

    const result = await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN });

    expect(result).toEqual({ localPurged: true, remote: 'completed' });
    // El access token sigue vigente por firma y por tiempo: solo la revocacion del servidor lo rechaza.
    const after = await harness.verifyAccess.execute({ accessToken: session.accessToken.value, origin: ORIGIN });
    expect(after).toMatchObject({ ok: false, error: SessionFailureKind.SESSION_REVOKED, requiresReauthentication: true });
  });

  it('criterio 6: el refresh token queda invalidado y no permite renovar la sesión', async () => {
    const { harness, closeSession, session } = await setup();

    await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN });

    const renewed = await harness.refresh.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });
    expect(renewed).toMatchObject({ ok: false, error: SessionFailureKind.SESSION_REVOKED });
  });

  it('criterio 2: el dispositivo se invalida por logout y deja de recibir notificaciones de la cuenta', async () => {
    const { harness, closeSession, session } = await setup();
    expect(await harness.deviceRegistry.findActiveForStudent(STUDENT.username)).toHaveLength(1);

    await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN });

    expect(await harness.deviceRegistry.findActiveForStudent(STUDENT.username)).toHaveLength(0);
    expect(await harness.deviceRegistry.findByToken(DEVICE)).toMatchObject({ status: 'invalidated', invalidatedReason: 'logout' });
  });

  it('criterio 2: un estudiante no puede invalidar el dispositivo de otra cuenta', async () => {
    const { harness, closeSession, session } = await setup();
    await harness.deviceRegistry.register('otro@upb.edu.co', 'device-ajeno', harness.clock.now());

    await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: 'device-ajeno', origin: ORIGIN });

    expect(await harness.deviceRegistry.findByToken('device-ajeno')).toMatchObject({ status: 'active' });
  });

  it('criterio 2: un dispositivo desconocido o ya invalidado no rompe el cierre', async () => {
    const { closeSession, harness, session } = await setup();
    await harness.deviceRegistry.invalidate(DEVICE, 'delivery-failed', harness.clock.now());

    const already = await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN });
    const unknown = await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: 'no-existe', origin: ORIGIN });

    expect(already.remote).toBe('completed');
    expect(unknown.remote).toBe('completed');
    expect(await harness.deviceRegistry.findByToken(DEVICE)).toMatchObject({ invalidatedReason: 'delivery-failed' });
  });

  it('criterio 3: el feed, el mapa descargado y el estado de postulaciones se eliminan del dispositivo', async () => {
    const { localData, closeSession, session } = await setup();

    await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN });

    expect(localData.count('feed')).toBe(0);
    expect(localData.count('offline-map')).toBe(0);
    expect(localData.count('application-status')).toBe(0);
  });

  it('el cierre sin dispositivo registrado revoca la sesión igualmente', async () => {
    const { harness, closeSession, session } = await setup();

    const result = await closeSession.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });

    expect(result.remote).toBe('completed');
    expect(await harness.refreshTokens.isChainRevoked(session.sessionId)).toBe(true);
    expect(await harness.deviceRegistry.findActiveForStudent(STUDENT.username)).toHaveLength(1);
  });

  describe('criterio 5 — falla de red durante el cierre', () => {
    it('la purga local se ejecuta igualmente y la revocación queda pendiente sin haberse aplicado', async () => {
      const { harness, localData, remote, pending, closeSession, session } = await setup();
      remote.online = false;

      const result = await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN });

      expect(result).toEqual({ localPurged: true, remote: 'pending' });
      expect(localData.count('feed')).toBe(0);
      expect(await pending.list()).toHaveLength(1);
      expect(await harness.refreshTokens.isChainRevoked(session.sessionId)).toBe(false);
    });

    it('al recuperar conexión se reintenta: el token se revoca, el dispositivo se invalida y la cola queda vacía', async () => {
      const { harness, remote, pending, closeSession, retry, session } = await setup();
      remote.online = false;
      await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN });

      remote.online = true;
      const retried = await retry.execute();

      expect(retried).toEqual({ completed: 1, rejected: 0, stillPending: 0 });
      expect(await pending.list()).toHaveLength(0);
      const access = await harness.verifyAccess.execute({ accessToken: session.accessToken.value, origin: ORIGIN });
      expect(access).toMatchObject({ ok: false, error: SessionFailureKind.SESSION_REVOKED });
      expect(await harness.deviceRegistry.findActiveForStudent(STUDENT.username)).toHaveLength(0);
    });

    it('si la red sigue caída, el reintento conserva la cola', async () => {
      const { remote, pending, closeSession, retry, session } = await setup();
      remote.online = false;
      await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN });

      const retried = await retry.execute();

      expect(retried).toEqual({ completed: 0, rejected: 0, stillPending: 1 });
      expect(await pending.list()).toHaveLength(1);
    });

    it('un reintento cuyo refresh token ya venció se descarta de la cola como rechazado', async () => {
      const { harness, remote, pending, closeSession, retry, session } = await setup();
      remote.online = false;
      await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN });

      harness.clock.advanceSeconds(harness.config.refreshTokenTtlSeconds + 1);
      remote.online = true;
      const retried = await retry.execute();

      expect(retried).toEqual({ completed: 0, rejected: 1, stillPending: 0 });
      expect(await pending.list()).toHaveLength(0);
    });

    it('se detiene en el primer fallo de red y conserva las entradas restantes', async () => {
      const { harness, pending, closeSession, session } = await setup();
      const second = await login(harness);
      const offline: RemoteSessionClosurePort = { close: async () => { throw new Error('sin red'); } };
      const offlineClose = new CloseSession({ localData: new InMemoryLocalDataPurge(), remote: offline, pending, clock: harness.clock });
      await offlineClose.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });
      await offlineClose.execute({ refreshToken: second.refreshToken.value, origin: ORIGIN });
      void closeSession;

      const retried = await new RetryPendingRevocations({ remote: offline, pending }).execute();

      expect(retried).toEqual({ completed: 0, rejected: 0, stillPending: 2 });
    });

    it('reintentar una revocación ya aplicada (respuesta perdida) es inocuo', async () => {
      const { harness, remote, pending, closeSession, retry, session } = await setup();
      await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN });
      await pending.enqueue({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN, requestedAt: harness.clock.now() });
      remote.online = true;

      const retried = await retry.execute();

      expect(retried).toEqual({ completed: 1, rejected: 0, stillPending: 0 });
    });
  });

  describe('orden y fallas parciales', () => {
    it('la purga local ocurre antes de la revocación remota', async () => {
      const calls: string[] = [];
      const localData: LocalDataPurgePort = { purge: async () => void calls.push('purge') };
      const remote: RemoteSessionClosurePort = { close: async () => { calls.push('remote'); return { ok: true }; } };
      const harness = buildSessionHarness();
      const closeSession = new CloseSession({ localData, remote, pending: new InMemoryPendingRevocationQueue(), clock: harness.clock });

      await closeSession.execute({ refreshToken: 'x', origin: ORIGIN });

      expect(calls).toEqual(['purge', 'remote']);
    });

    it('si la purga local falla, la revocación remota se intenta igual y se informa el fallo', async () => {
      const { harness, remote, session } = await setup();
      const failingPurge: LocalDataPurgePort = { purge: async () => { throw new Error('disco lleno'); } };
      const closeSession = new CloseSession({ localData: failingPurge, remote, pending: new InMemoryPendingRevocationQueue(), clock: harness.clock });

      const result = await closeSession.execute({ refreshToken: session.refreshToken.value, deviceToken: DEVICE, origin: ORIGIN });

      expect(result).toEqual({ localPurged: false, remote: 'completed' });
      expect(await harness.refreshTokens.isChainRevoked(session.sessionId)).toBe(true);
    });

    it('un refresh token manipulado es rechazado por el servidor, no se reintenta, pero la purga local se hace', async () => {
      const { localData, pending, closeSession, session } = await setup();
      const forged = `${session.refreshToken.value.slice(0, -3)}abc`;

      const result = await closeSession.execute({ refreshToken: forged, deviceToken: DEVICE, origin: ORIGIN });

      expect(result).toMatchObject({ localPurged: true, remote: 'rejected', rejection: { error: SessionFailureKind.INVALID_TOKEN } });
      expect(localData.count('feed')).toBe(0);
      expect(await pending.list()).toHaveLength(0);
    });

    it('la entrada pendiente registra cuándo se solicitó el cierre', async () => {
      const { harness, remote, pending, closeSession, session } = await setup();
      remote.online = false;

      await closeSession.execute({ refreshToken: session.refreshToken.value, origin: ORIGIN });

      const [item] = await pending.list();
      expect(item).toMatchObject({ origin: ORIGIN, requestedAt: harness.clock.now() });
      expect(item).not.toHaveProperty('deviceToken');
    });
  });
});
