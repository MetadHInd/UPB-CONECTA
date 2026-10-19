import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Router } from 'express';
import { createHttpServer } from '../../src/infrastructure/http/server.js';
import { STUDENT } from '../identity/sessionHarness.js';

/** Credencial de prueba compartida con el resto de arneses (no es un secreto real). */
export const PASSWORD = STUDENT.password;
export const EMAIL = 'ana.perez@upb.edu.co';
export const STUDENT_PROFILE = { name: 'Ana Pérez', email: EMAIL, program: 'Ingeniería de Sistemas e Informática', semester: 6 };

/** Levanta los routers en un puerto libre y devuelve `call`, un cliente fetch con token opcional. */
export async function startHttp(routers: Router[], track: (server: Server) => void) {
  const server = createHttpServer(routers).listen(0);
  track(server);
  await new Promise((resolve) => server.once('listening', resolve));
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
  return { call, token: login.body['session'].accessToken.value as string };
}
