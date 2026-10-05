import { describe, it, expect, beforeEach } from 'vitest';
import { IdempotencyPolicy } from '../../src/contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import { InMemoryProcessedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryProcessedMessageRegistry.js';
import type { RawInstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/RawInstitutionalMessage.js';

function message(id: string, uid: number): RawInstitutionalMessage {
  return {
    messageId: MessageId.fromHeader(id),
    mailboxUid: uid,
    sender: 'idiomas@upb.edu.co',
    subject: 'Convocatoria',
    receivedAt: new Date('2026-08-03T13:05:00Z'),
    rawBody: '<p>cuerpo</p>'
  };
}

describe('IdempotencyPolicy', () => {
  let registry: InMemoryProcessedMessageRegistry;
  let policy: IdempotencyPolicy;

  beforeEach(() => {
    registry = new InMemoryProcessedMessageRegistry();
    policy = new IdempotencyPolicy(registry);
  });

  it('procesa un mensaje que no ha sido visto antes', async () => {
    const decision = await policy.decide(message('<a@upb.edu.co>', 1));
    expect(decision.kind).toBe('process');
  });

  it('descarta como duplicado un mensaje ya registrado', async () => {
    const m = message('<a@upb.edu.co>', 1);
    await registry.markAsProcessed(m.messageId, m.mailboxUid, new Date());
    const decision = await policy.decide(m);
    expect(decision.kind).toBe('discard-duplicate');
    if (decision.kind === 'discard-duplicate') {
      expect(decision.reason).toContain('a@upb.edu.co');
    }
  });

  it('no confunde dos mensajes con el mismo asunto y distinta identidad', async () => {
    const original = message('<a@upb.edu.co>', 1);
    await registry.markAsProcessed(original.messageId, original.mailboxUid, new Date());
    const reenvio = message('<b@upb.edu.co>', 2);
    expect((await policy.decide(reenvio)).kind).toBe('process');
  });
});
