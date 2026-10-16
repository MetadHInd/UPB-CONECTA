import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../src/infrastructure/http/server.js';
import { createAuthRouter } from '../../src/contexts/identity/infrastructure/http/authRoutes.js';
import { buildSessionHarness, STUDENT } from './sessionHarness.js';

/**
 * HU-39, criterio 2, por HTTP: `POST /auth/logout` acepta un `deviceToken`
 * opcional y da de baja ese dispositivo solo si pertenece a la cuenta de la
 * sesion. Sin `deviceToken` el cierre de sesion se comporta como en HU-45.
 */
let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function start() {
  const harness = buildSessionHarness();
  harness.provider.register({
    username: STUDENT.username,
    password: STUDENT.password,
    profile: { name: 'Ana Gómez', email: STUDENT.username, program: 'Ingeniería de Sistemas', semester: 5 }
  });
  const app = createHttpServer([createAuthRouter(harness.authenticate, { refresh: harness.refresh, logout: harness.logout })]);
  server = app.listen(0);
  await new Promise((resolve) => server!.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function post(path: string, body: unknown) {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  }

  async function login() {
    const { body } = await post('/auth/login', { username: STUDENT.username, password: STUDENT.password });
    return body['session'].refreshToken.value as string;
  }

  return { harness, post, login };
}

describe('POST /auth/logout con deviceToken (HU-39, criterio 2)', () => {
  it('revoca la sesion y da de baja el dispositivo propio', async () => {
    const { harness, post, login } = await start();
    await harness.deviceRegistry.register(STUDENT.username, 'device-propio', harness.clock.now());
    const refreshToken = await login();

    const response = await post('/auth/logout', { refreshToken, deviceToken: 'device-propio' });

    expect(response.status).toBe(200);
    expect(await harness.deviceRegistry.findByToken('device-propio')).toMatchObject({ status: 'invalidated', invalidatedReason: 'logout' });
    const renewed = await post('/auth/refresh', { refreshToken });
    expect(renewed.status).toBe(401);
  });

  it('no da de baja el dispositivo de otra cuenta', async () => {
    const { harness, post, login } = await start();
    await harness.deviceRegistry.register('otro@upb.edu.co', 'device-ajeno', harness.clock.now());
    const refreshToken = await login();

    const response = await post('/auth/logout', { refreshToken, deviceToken: 'device-ajeno' });

    expect(response.status).toBe(200);
    expect(await harness.deviceRegistry.findByToken('device-ajeno')).toMatchObject({ status: 'active' });
  });

  it('sin deviceToken cierra la sesion y deja intactos los dispositivos', async () => {
    const { harness, post, login } = await start();
    await harness.deviceRegistry.register(STUDENT.username, 'device-propio', harness.clock.now());
    const refreshToken = await login();

    const response = await post('/auth/logout', { refreshToken });

    expect(response.status).toBe(200);
    expect(await harness.deviceRegistry.findByToken('device-propio')).toMatchObject({ status: 'active' });
  });
});
