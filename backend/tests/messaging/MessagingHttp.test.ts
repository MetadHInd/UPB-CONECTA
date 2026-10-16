import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../src/infrastructure/http/server.js';
import { createAuthRouter } from '../../src/contexts/identity/infrastructure/http/authRoutes.js';
import { requireSession, sessionPrincipal } from '../../src/contexts/identity/infrastructure/http/requireSession.js';
import { createMessagingRouter } from '../../src/contexts/messaging/infrastructure/http/messagingRoutes.js';
import { buildSessionHarness } from '../identity/sessionHarness.js';
import { buildMessagingHarness, PROFESSOR } from './messagingHarness.js';

const PASSWORD = 'S3cr3t!UPB';
let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function start() {
  const identity = buildSessionHarness();
  identity.provider.register({
    username: PROFESSOR.email,
    password: PASSWORD,
    profile: { name: PROFESSOR.name, email: PROFESSOR.email, program: PROFESSOR.program }
  });
  identity.provider.register({
    username: 'julian.vargas@upb.edu.co',
    password: PASSWORD,
    profile: { name: 'Julián Vargas', email: 'julian.vargas@upb.edu.co', program: 'Ingeniería Industrial', semester: 10 }
  });
  const messaging = buildMessagingHarness();
  const app = createHttpServer([
    createAuthRouter(identity.authenticate, { refresh: identity.refresh, logout: identity.logout }),
    createMessagingRouter(messaging.useCases, requireSession(identity.verifyAccess), (res) => sessionPrincipal(res).subject)
  ]);
  server = app.listen(0);
  await new Promise((resolve) => server!.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function call(method: string, path: string, options: { token?: string; body?: unknown } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  }

  async function loginAs(username: string) {
    const { body } = await call('POST', '/auth/login', { body: { username, password: PASSWORD } });
    return { access: body['session'].accessToken.value as string, refresh: body['session'].refreshToken.value as string };
  }

  return { identity, call, loginAs };
}

describe('Mensajería por HTTP con sesión real (JWT)', () => {
  it('profesor escribe, estudiante lee y responde, profesor ve la respuesta', async () => {
    const { call, loginAs } = await start();
    const professor = await loginAs(PROFESSOR.email);
    const student = await loginAs('julian.vargas@upb.edu.co');

    const students = await call('GET', '/messaging/students', { token: professor.access });
    expect(students.status).toBe(200);
    expect(students.body['students'].map((s: { email: string }) => s.email)).toContain('julian.vargas@upb.edu.co');

    const created = await call('POST', '/messaging/conversations', {
      token: professor.access,
      body: { studentEmail: 'julian.vargas@upb.edu.co', subject: 'Proyecto', text: 'Hola Julián' }
    });
    expect(created.status).toBe(201);
    const id = created.body['conversation'].id as string;

    const inbox = await call('GET', '/messaging/conversations', { token: student.access });
    expect(inbox.body['conversations'][0]).toMatchObject({ id, subject: 'Proyecto', lastMessage: { text: 'Hola Julián' } });

    const reply = await call('POST', `/messaging/conversations/${id}/messages`, { token: student.access, body: { text: 'Hola profe' } });
    expect(reply.status).toBe(201);

    const thread = await call('GET', `/messaging/conversations/${id}`, { token: professor.access });
    expect(thread.body['conversation'].messages.map((m: { text: string }) => m.text)).toEqual(['Hola Julián', 'Hola profe']);
    expect(typeof thread.body['conversation'].messages[0].sentAt).toBe('string');
  });

  it('el autor sale del token: un campo de autor en el cuerpo se ignora', async () => {
    const { call, loginAs } = await start();
    const professor = await loginAs(PROFESSOR.email);
    const student = await loginAs('julian.vargas@upb.edu.co');

    const asStudent = await call('POST', '/messaging/conversations', {
      token: student.access,
      body: { requesterEmail: PROFESSOR.email, studentEmail: 'julian.vargas@upb.edu.co', subject: 'x', text: 'x' }
    });
    expect(asStudent.status).toBe(403);
    expect(professor.access).not.toBe(student.access);
  });

  it('sin token, o con un token alterado, responde 401', async () => {
    const { call, loginAs } = await start();
    const professor = await loginAs(PROFESSOR.email);

    const missing = await call('GET', '/messaging/conversations');
    expect(missing.status).toBe(401);
    expect(missing.body).toMatchObject({ ok: false, error: 'missing-token', requiresReauthentication: true });

    const tampered = await call('GET', '/messaging/conversations', { token: `${professor.access}x` });
    expect(tampered.status).toBe(401);
    expect(tampered.body['requiresReauthentication']).toBe(true);
  });

  it('un token vencido pide renovar; /auth/refresh entrega un par nuevo que vuelve a funcionar', async () => {
    const { identity, call, loginAs } = await start();
    const professor = await loginAs(PROFESSOR.email);
    identity.clock.advanceSeconds(identity.config.accessTokenTtlSeconds + 1);

    const expired = await call('GET', '/messaging/conversations', { token: professor.access });
    expect(expired.status).toBe(401);
    expect(expired.body).toMatchObject({ error: 'token-expired', requiresReauthentication: false });

    const refreshed = await call('POST', '/auth/refresh', { body: { refreshToken: professor.refresh } });
    expect(refreshed.status).toBe(200);
    const newAccess = refreshed.body['session'].accessToken.value as string;
    expect((await call('GET', '/messaging/conversations', { token: newAccess })).status).toBe(200);

    // El refresh token usado no sirve otra vez (rotación, HU-45).
    expect((await call('POST', '/auth/refresh', { body: { refreshToken: professor.refresh } })).status).toBe(401);
  });

  it('/auth/logout revoca la sesión: el access token deja de servir', async () => {
    const { call, loginAs } = await start();
    const professor = await loginAs(PROFESSOR.email);

    expect((await call('POST', '/auth/logout', { body: { refreshToken: professor.refresh } })).status).toBe(200);
    const after = await call('GET', '/messaging/conversations', { token: professor.access });
    expect(after.status).toBe(401);
    expect(after.body['error']).toBe('session-revoked');
  });

  it('/auth/refresh sin refreshToken responde 400', async () => {
    const { call } = await start();
    expect((await call('POST', '/auth/refresh', { body: {} })).status).toBe(400);
  });
});
