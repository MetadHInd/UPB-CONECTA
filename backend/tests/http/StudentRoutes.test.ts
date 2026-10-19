import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../src/infrastructure/http/server.js';
import { createAuthRouter } from '../../src/contexts/identity/infrastructure/http/authRoutes.js';
import { requireSession, sessionPrincipal } from '../../src/contexts/identity/infrastructure/http/requireSession.js';
import { createFeedRouter } from '../../src/contexts/feed/infrastructure/http/feedRoutes.js';
import { createProfileRouter } from '../../src/contexts/profile/infrastructure/http/profileRoutes.js';
import { ProfileUpdateFailureKind } from '../../src/contexts/profile/application/UpdateStudentProfile.js';
import { buildSessionHarness } from '../identity/sessionHarness.js';

const PASSWORD = 'S3cr3t!UPB';
const EMAIL = 'ana.perez@upb.edu.co';
let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function start() {
  const identity = buildSessionHarness();
  identity.provider.register({
    username: EMAIL,
    password: PASSWORD,
    profile: { name: 'Ana Pérez', email: EMAIL, program: 'Ingeniería de Sistemas e Informática', semester: 6 }
  });
  const calls: { feed: Array<{ studentEmail: string; limit?: number | undefined; text?: string | undefined; categories?: readonly string[] | undefined }>; updates: Array<Record<string, unknown>> } = {
    feed: [],
    updates: []
  };
  const guard = requireSession(identity.verifyAccess);
  const principal = (res: Parameters<typeof sessionPrincipal>[0]) => sessionPrincipal(res).subject;
  const app = createHttpServer([
    createAuthRouter(identity.authenticate, { refresh: identity.refresh, logout: identity.logout }),
    createFeedRouter(
      {
        queryFeed: {
          execute: async (input) => {
            calls.feed.push(input);
            return { ok: true as const, feed: [{ id: 'c1' }] as never, incompleteProfile: false };
          }
        }
      },
      guard,
      principal
    ),
    createProfileRouter(
      {
        viewProfile: {
          execute: async (record) => ({ readOnly: { email: record.email, name: record.name } }) as never
        },
        updateProfile: {
          execute: async (input) => {
            calls.updates.push(input.changes as Record<string, unknown>);
            if ('program' in input.changes) {
              return { ok: false, error: ProfileUpdateFailureKind.READ_ONLY_FIELD, message: 'solo lectura' } as never;
            }
            return { ok: true, editable: { semester: input.changes['semester'] } } as never;
          }
        },
        findDirectoryRecord: async (email) =>
          email === EMAIL ? { name: 'Ana Pérez', email, program: 'Ingeniería de Sistemas e Informática', semester: 6 } : null
      },
      guard,
      principal
    )
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
  const login = await call('POST', '/auth/login', { body: { username: EMAIL, password: PASSWORD } });
  const token = login.body['session'].accessToken.value as string;
  return { call, token, calls };
}

describe('Feed y perfil por HTTP con sesión real', () => {
  it('rechaza sin token (RNF-14)', async () => {
    const { call } = await start();
    expect((await call('GET', '/feed')).status).toBe(401);
    expect((await call('GET', '/profile')).status).toBe(401);
    expect((await call('PUT', '/profile', { body: { semester: 7 } })).status).toBe(401);
  });

  it('el feed usa el correo del token y reenvía el límite (RF-17)', async () => {
    const { call, token, calls } = await start();
    const res = await call('GET', '/feed?limit=20', { token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, feed: [{ id: 'c1' }], incompleteProfile: false });
    expect(calls.feed).toEqual([{ studentEmail: EMAIL, limit: 20, text: undefined, categories: undefined }]);
  });

  it('reenvía búsqueda y categorías ya separadas (RF-20, RF-21)', async () => {
    const { call, token, calls } = await start();
    const res = await call('GET', '/feed?q=matricula&categories=beca,evento', { token });
    expect(res.status).toBe(200);
    expect(calls.feed[0]).toMatchObject({ text: 'matricula', categories: ['beca', 'evento'] });
  });

  it('rechaza un texto de búsqueda demasiado largo (RNF-15)', async () => {
    const { call, token, calls } = await start();
    const res = await call('GET', `/feed?q=${'a'.repeat(101)}`, { token });
    expect(res.status).toBe(400);
    expect(res.body['error']).toBe('invalid-text');
    expect(calls.feed).toHaveLength(0);
  });

  it.each(['0', '101', 'abc', '-3', '1.5'])('rechaza limit=%s (RNF-15)', async (limit) => {
    const { call, token, calls } = await start();
    const res = await call('GET', `/feed?limit=${limit}`, { token });
    expect(res.status).toBe(400);
    expect(res.body['error']).toBe('invalid-limit');
    expect(calls.feed).toHaveLength(0);
  });

  it('consulta el perfil del propio estudiante (RF-59)', async () => {
    const { call, token } = await start();
    const res = await call('GET', '/profile', { token });
    expect(res.status).toBe(200);
    expect(res.body['profile'].readOnly).toMatchObject({ email: EMAIL, name: 'Ana Pérez' });
  });

  it('actualiza el semestre (RF-60) y rechaza campos del directorio con 403', async () => {
    const { call, token, calls } = await start();
    const ok = await call('PUT', '/profile', { token, body: { semester: 7 } });
    expect(ok.status).toBe(200);
    expect(ok.body['editable']).toEqual({ semester: 7 });

    const readOnly = await call('PUT', '/profile', { token, body: { program: 'Medicina' } });
    expect(readOnly.status).toBe(403);
    expect(readOnly.body['error']).toBe(ProfileUpdateFailureKind.READ_ONLY_FIELD);
    expect(calls.updates).toHaveLength(2);
  });

  it('rechaza un cuerpo que no es un objeto (RNF-15)', async () => {
    const { call, token } = await start();
    const res = await call('PUT', '/profile', { token, body: [1, 2] });
    expect(res.status).toBe(400);
    expect(res.body['error']).toBe('invalid-body');
  });
});
