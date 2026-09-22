import { describe, expect, it } from 'vitest';
import { IngestInstitutionalMessages } from '../../src/contexts/ingestion/application/IngestInstitutionalMessages.js';
import type { RawInstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/RawInstitutionalMessage.js';
import type { MessageFailureRepositoryPort } from '../../src/contexts/ingestion/domain/ports/out/MessageFailureRepositoryPort.js';
import type { MessageNormalizerPort } from '../../src/contexts/ingestion/domain/ports/out/MessageNormalizerPort.js';
import { DeduplicationPolicy } from '../../src/contexts/ingestion/domain/services/DeduplicationPolicy.js';
import { IdempotencyPolicy } from '../../src/contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { QuarantineIncidentPolicy } from '../../src/contexts/ingestion/domain/services/QuarantineIncidentPolicy.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryIngestionCursorRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionCursorRepository.js';
import { InMemoryIngestionRunLogRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionRunLogRepository.js';
import { InMemoryMailboxAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryMailboxAdapter.js';
import { InMemoryMessageFailureRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryMessageFailureRepository.js';
import { InMemoryProcessedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryProcessedMessageRegistry.js';
import { InMemoryQuarantineRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryQuarantineRepository.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { MimeMessageNormalizerAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/normalization/MimeMessageNormalizerAdapter.js';
import { SpanishDueDateExtractor } from '../../src/contexts/ingestion/infrastructure/extraction/SpanishDueDateExtractor.js';
import { buildFixtureMessages } from '../../src/contexts/ingestion/infrastructure/fixtures/institutionalMessages.js';

const fixtures = buildFixtureMessages().slice(0, 5).sort((a, b) => a.mailboxUid - b.mailboxUid);
const POISON = fixtures[1]!;

/** Normalizador que falla siempre (o las primeras `times` veces) con un uid concreto. */
class FailingNormalizer implements MessageNormalizerPort {
  private readonly real = new MimeMessageNormalizerAdapter();
  private failures = 0;

  constructor(private readonly uid: number, private readonly times = Number.POSITIVE_INFINITY) {}

  normalize(message: RawInstitutionalMessage) {
    if (message.mailboxUid === this.uid && this.failures < this.times) {
      this.failures += 1;
      throw new Error('cuerpo MIME imposible de normalizar');
    }
    return this.real.normalize(message);
  }
}

function build(options: { normalizer: MessageNormalizerPort; failures?: MessageFailureRepositoryPort; maxAttempts?: number }) {
  const registry = new InMemoryProcessedMessageRegistry();
  const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
  const quarantine = new InMemoryQuarantineRepository();
  const cursors = new InMemoryIngestionCursorRepository();
  const failures = options.failures ?? new InMemoryMessageFailureRepository();
  const useCase = new IngestInstitutionalMessages({
    mailbox: new InMemoryMailboxAdapter(fixtures),
    registry,
    consolidatedRegistry,
    quarantine,
    cursors,
    logs: new InMemoryIngestionRunLogRepository(),
    idempotency: new IdempotencyPolicy(registry),
    deduplication: new DeduplicationPolicy(consolidatedRegistry),
    deduplicationWindowMs: 30 * 86_400_000,
    quarantineIncidentPolicy: new QuarantineIncidentPolicy(1),
    normalizer: options.normalizer,
    dueDateExtractor: new SpanishDueDateExtractor(),
    clock: new FixedClock(new Date('2026-09-22T12:00:00Z')),
    batchSize: 200,
    poisonMessages: { failures, maxAttempts: options.maxAttempts ?? 3 }
  });
  return { useCase, registry, quarantine, cursors, failures };
}

async function runCycle(useCase: IngestInstitutionalMessages) {
  try {
    return { log: await useCase.execute(), error: null };
  } catch (error) {
    return { log: null, error: error as Error };
  }
}

describe('Corrección bug 2 — un mensaje que falla siempre no bloquea el buzón indefinidamente', () => {
  it('tras el umbral de ciclos fallidos va a cuarentena y el resto del buzón se procesa', async () => {
    const env = build({ normalizer: new FailingNormalizer(POISON.mailboxUid) });

    // Ciclos 1 y 2: el fallo conserva el cursor (HU-01) y aborta el ciclo, como antes.
    for (let cycle = 1; cycle <= 2; cycle += 1) {
      const { error } = await runCycle(env.useCase);
      expect(error?.message).toContain('imposible de normalizar');
      expect((await env.cursors.load()).lastConfirmedUid).toBe(fixtures[0]!.mailboxUid);
    }

    // Ciclo 3: tercer fallo del mismo mensaje -> cuarentena y el lote continúa.
    const { log, error } = await runCycle(env.useCase);
    expect(error).toBeNull();
    expect(log?.quarantined).toBe(1);
    const quarantined = await env.quarantine.findByUid(POISON.mailboxUid);
    expect(quarantined?.cause).toContain('3 ciclos consecutivos de ingesta');
    expect(quarantined?.cause).toContain('imposible de normalizar');
    expect(quarantined?.rawSource).toContain(POISON.messageId.toString());
    for (const later of fixtures.slice(2)) {
      expect(await env.registry.hasBeenProcessed(later.messageId)).toBe(true);
    }
    expect(await env.registry.hasBeenProcessed(POISON.messageId)).toBe(false);
    expect((await env.cursors.load()).lastConfirmedUid).toBe(fixtures.at(-1)!.mailboxUid);

    // Ciclo 4: el mensaje en cuarentena ya no se reintenta.
    const next = await runCycle(env.useCase);
    expect(next.error).toBeNull();
    expect(next.log?.read).toBe(0);
  });

  it('un fallo transitorio que se resuelve antes del umbral se procesa normalmente', async () => {
    const env = build({ normalizer: new FailingNormalizer(POISON.mailboxUid, 1) });

    expect((await runCycle(env.useCase)).error).not.toBeNull();
    const { error } = await runCycle(env.useCase);

    expect(error).toBeNull();
    expect(await env.registry.hasBeenProcessed(POISON.messageId)).toBe(true);
    expect(await env.quarantine.findByUid(POISON.mailboxUid)).toBeNull();
  });

  it('el umbral es configurable: con 1 intento va a cuarentena en el primer fallo', async () => {
    const env = build({ normalizer: new FailingNormalizer(POISON.mailboxUid), maxAttempts: 1 });

    const { error, log } = await runCycle(env.useCase);

    expect(error).toBeNull();
    expect(log?.quarantined).toBe(1);
  });

  it('si no se puede registrar el fallo (p. ej. Mongo caído), no se pone nada en cuarentena y se propaga el error original', async () => {
    const failures: MessageFailureRepositoryPort = {
      recordFailure: async () => {
        throw new Error('Mongo no disponible');
      }
    };
    const env = build({ normalizer: new FailingNormalizer(POISON.mailboxUid), failures, maxAttempts: 1 });

    const { error } = await runCycle(env.useCase);

    expect(error?.message).toContain('imposible de normalizar');
    expect(await env.quarantine.findByUid(POISON.mailboxUid)).toBeNull();
    expect((await env.cursors.load()).lastConfirmedUid).toBe(fixtures[0]!.mailboxUid);
  });

  it('rechaza un umbral que no sea un entero positivo', () => {
    expect(() => build({ normalizer: new MimeMessageNormalizerAdapter(), maxAttempts: 0 })).toThrow(RangeError);
  });
});
