import { describe, it, expect } from 'vitest';
import { IngestInstitutionalMessages } from '../../src/contexts/ingestion/application/IngestInstitutionalMessages.js';
import { IdempotencyPolicy } from '../../src/contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { DeduplicationPolicy } from '../../src/contexts/ingestion/domain/services/DeduplicationPolicy.js';
import { QuarantineIncidentPolicy } from '../../src/contexts/ingestion/domain/services/QuarantineIncidentPolicy.js';
import { MailboxUnavailableError } from '../../src/contexts/ingestion/domain/ports/out/MailboxIngestionPort.js';
import { InMemoryMailboxAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryMailboxAdapter.js';
import { InMemoryProcessedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryProcessedMessageRegistry.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import { InMemoryQuarantineRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryQuarantineRepository.js';
import { InMemoryIngestionCursorRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionCursorRepository.js';
import { InMemoryIngestionRunLogRepository } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryIngestionRunLogRepository.js';
import { FixedClock } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { MimeMessageNormalizerAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/normalization/MimeMessageNormalizerAdapter.js';
import { SpanishDueDateExtractor } from '../../src/contexts/ingestion/infrastructure/extraction/SpanishDueDateExtractor.js';
import { buildFixtureMessages } from '../../src/contexts/ingestion/infrastructure/fixtures/institutionalMessages.js';

const DEDUPLICATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * HU-55, criterio 4 — CUBIERTO PARCIALMENTE: el criterio original habla de
 * que "la aplicacion continua sirviendo el contenido ya almacenado sin
 * presentar errores al estudiante", pero no existe todavia ninguna capa que
 * sirva contenido (sin feed, sin HTTP). El proxy verificable en este
 * backend es que una caida del buzon durante un ciclo de ingesta no borre
 * ni corrompa lo que ya se guardo en ejecuciones anteriores — que es
 * precisamente lo que tendria que leer esa futura capa de feed.
 */
describe('HU-55 criterio 4 (parcial) — el contenido ya ingerido sobrevive a una caida del buzon', () => {
  it('una caida del buzon en el siguiente ciclo no afecta lo ya consolidado en el ciclo anterior', async () => {
    const registry = new InMemoryProcessedMessageRegistry();
    const consolidatedRegistry = new InMemoryConsolidatedMessageRegistry();
    const quarantine = new InMemoryQuarantineRepository();
    const cursors = new InMemoryIngestionCursorRepository();
    const logs = new InMemoryIngestionRunLogRepository();
    const mailbox = new InMemoryMailboxAdapter(buildFixtureMessages());

    const useCase = new IngestInstitutionalMessages({
      mailbox,
      registry,
      consolidatedRegistry,
      quarantine,
      cursors,
      logs,
      idempotency: new IdempotencyPolicy(registry),
      deduplication: new DeduplicationPolicy(consolidatedRegistry),
      deduplicationWindowMs: DEDUPLICATION_WINDOW_MS,
      quarantineIncidentPolicy: new QuarantineIncidentPolicy(1),
      normalizer: new MimeMessageNormalizerAdapter(),
      dueDateExtractor: new SpanishDueDateExtractor(),
      clock: new FixedClock(new Date('2026-08-24T10:00:00Z')),
      batchSize: 200
    });

    // Ciclo 1: el buzon responde con normalidad, se consolidan convocatorias.
    await useCase.execute();
    const antes = await consolidatedRegistry.findWithinWindow(
      'idiomas@upb.edu.co',
      'Apertura de inscripciones curso de ingles 2026-20',
      new Date('2026-08-11T13:00:00Z'),
      DEDUPLICATION_WINDOW_MS
    );
    expect(antes).not.toBeNull();
    const totalAntes = consolidatedRegistry.size;
    expect(totalAntes).toBeGreaterThan(0);

    // Ciclo 2: el buzon institucional cae.
    mailbox.simulateUnavailability('tiempo de espera agotado');
    await expect(useCase.execute()).rejects.toThrow(MailboxUnavailableError);

    // Lo consolidado en el ciclo 1 sigue intacto: una caida del buzon no
    // borra ni corrompe el contenido que un futuro feed tendria que servir.
    const despues = await consolidatedRegistry.findWithinWindow(
      'idiomas@upb.edu.co',
      'Apertura de inscripciones curso de ingles 2026-20',
      new Date('2026-08-11T13:00:00Z'),
      DEDUPLICATION_WINDOW_MS
    );
    expect(despues).toEqual(antes);
    expect(consolidatedRegistry.size).toBe(totalAntes);
  });
});
