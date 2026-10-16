import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Router } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer, type HttpServerOptions } from '../../src/infrastructure/http/server.js';

/**
 * Comportamiento de la capa HTTP que importa al correr varias replicas detras
 * de un balanceador: liveness/readiness, identificacion de la replica y
 * resolucion de la IP real del cliente (RNF-09, RNF-16).
 */
let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

async function start(options: HttpServerOptions = {}) {
  const echoIp = Router();
  echoIp.get('/echo-ip', (req, res) => {
    res.status(200).json({ ip: req.ip });
  });
  server = createHttpServer([echoIp], options).listen(0);
  await new Promise((resolve) => server!.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return async (path: string, headers: Record<string, string> = {}) => {
    const response = await fetch(base + path, { headers });
    return { status: response.status, headers: response.headers, body: (await response.json()) as Record<string, unknown> };
  };
}

describe('capa HTTP para varias replicas', () => {
  it('/health responde 200 sin consultar dependencias', async () => {
    const get = await start({ isReady: async () => false });
    const res = await get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('/ready responde 200 cuando no hay sondeo configurado', async () => {
    const get = await start();
    expect((await get('/ready')).status).toBe(200);
  });

  it('/ready responde 200 si el sondeo confirma las dependencias', async () => {
    const get = await start({ isReady: async () => true });
    const res = await get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, ready: true });
  });

  it('/ready responde 503 si el sondeo dice que no esta listo', async () => {
    const get = await start({ isReady: async () => false });
    const res = await get('/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, ready: false });
  });

  it('/ready responde 503 si el sondeo lanza (MongoDB caido)', async () => {
    const get = await start({
      isReady: async () => {
        throw new Error('ping timeout');
      }
    });
    expect((await get('/ready')).status).toBe(503);
  });

  it('devuelve la replica en X-Instance solo si se configuro', async () => {
    const withId = await start({ instanceId: 'replica-a' });
    expect((await withId('/health')).headers.get('x-instance')).toBe('replica-a');
    server?.close();
    const withoutId = await start();
    expect((await withoutId('/health')).headers.get('x-instance')).toBeNull();
  });

  it('no anuncia el framework en X-Powered-By', async () => {
    const get = await start();
    expect((await get('/health')).headers.get('x-powered-by')).toBeNull();
  });

  it('req.ip toma la IP real del cliente de X-Forwarded-For (trust proxy)', async () => {
    const get = await start();
    const res = await get('/echo-ip', { 'x-forwarded-for': '203.0.113.7' });
    expect(res.body['ip']).toBe('203.0.113.7');
  });
});
