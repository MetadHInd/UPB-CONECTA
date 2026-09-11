import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IngestionScheduler } from '../../src/contexts/ingestion/infrastructure/scheduler/IngestionScheduler.js';
import { IngestionRunLog } from '../../src/contexts/ingestion/domain/entities/IngestionRunLog.js';
import type { IngestInstitutionalMessagesPort } from '../../src/contexts/ingestion/domain/ports/in/IngestInstitutionalMessagesPort.js';

describe('IngestionScheduler, criterios de aceptacion 1 y 2', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  function useCaseSpy(): { port: IngestInstitutionalMessagesPort; calls: () => number } {
    let calls = 0;
    return {
      port: { execute: async () => { calls += 1; return new IngestionRunLog(new Date()); } },
      calls: () => calls
    };
  }

  it('dispara el caso de uso en el intervalo configurado sin intervencion humana', async () => {
    const spy = useCaseSpy();
    const scheduler = new IngestionScheduler(spy.port, () => ({ intervalMs: 60_000, batchSize: 200, deduplicationWindowMs: 2_592_000_000 }));

    scheduler.start();
    expect(spy.calls()).toBe(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(spy.calls()).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(spy.calls()).toBe(2);

    scheduler.stop();
  });

  it('aplica un cambio de intervalo sin reiniciar el proceso', async () => {
    const spy = useCaseSpy();
    let intervalMs = 60_000;
    const scheduler = new IngestionScheduler(spy.port, () => ({ intervalMs, batchSize: 200, deduplicationWindowMs: 2_592_000_000 }));

    scheduler.start();

    // El administrador reduce la frecuencia sin recompilar ni redesplegar. El
    // ciclo ya programado conserva su temporizador y el cambio aplica desde el
    // siguiente, que es la semantica esperada de una recarga en caliente.
    intervalMs = 10_000;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(spy.calls()).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(spy.calls()).toBe(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(spy.calls()).toBe(3);

    scheduler.stop();
  });

  it('no detiene el servicio cuando un ciclo falla', async () => {
    let calls = 0;
    const errores: unknown[] = [];
    const port: IngestInstitutionalMessagesPort = {
      execute: async () => {
        calls += 1;
        if (calls === 1) throw new Error('buzon no responde');
        return new IngestionRunLog(new Date());
      }
    };

    const scheduler = new IngestionScheduler(port, () => ({ intervalMs: 30_000, batchSize: 200, deduplicationWindowMs: 2_592_000_000 }), (e) => errores.push(e));
    scheduler.start();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(errores).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(2);

    scheduler.stop();
  });

  it('no solapa ciclos cuando una ejecucion tarda mas que el intervalo', async () => {
    let enCurso = 0;
    let maximoSimultaneo = 0;
    const port: IngestInstitutionalMessagesPort = {
      execute: async () => {
        enCurso += 1;
        maximoSimultaneo = Math.max(maximoSimultaneo, enCurso);
        await new Promise((r) => setTimeout(r, 90_000));
        enCurso -= 1;
        return new IngestionRunLog(new Date());
      }
    };

    const scheduler = new IngestionScheduler(port, () => ({ intervalMs: 30_000, batchSize: 200, deduplicationWindowMs: 2_592_000_000 }));
    scheduler.start();
    await vi.advanceTimersByTimeAsync(300_000);

    expect(maximoSimultaneo).toBe(1);
    scheduler.stop();
  });

  it('detiene el planificador y reporta una configuracion invalida', async () => {
    const spy = useCaseSpy();
    const errores: unknown[] = [];
    const scheduler = new IngestionScheduler(
      spy.port,
      () => { throw new Error('INGESTION_INTERVAL_MS debe ser un entero positivo'); },
      (e) => errores.push(e)
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(spy.calls()).toBe(0);
    expect(errores).toHaveLength(1);
  });

  it('es seguro llamar start dos veces y stop sin haber arrancado', () => {
    const spy = useCaseSpy();
    const scheduler = new IngestionScheduler(spy.port, () => ({ intervalMs: 30_000, batchSize: 200, deduplicationWindowMs: 2_592_000_000 }));
    scheduler.stop();
    scheduler.start();
    scheduler.start();
    expect(scheduler.isRunning).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning).toBe(false);
  });
});
