import { describe, it, expect, beforeEach } from 'vitest';
import { DeduplicationPolicy } from '../../src/contexts/ingestion/domain/services/DeduplicationPolicy.js';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import { InMemoryConsolidatedMessageRegistry } from '../../src/contexts/ingestion/infrastructure/adapters/out/memory/InMemoryConsolidatedMessageRegistry.js';
import type { InstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 horas

function message(id: string, sentAt: string, overrides: Partial<InstitutionalMessage> = {}): InstitutionalMessage {
  return {
    messageId: MessageId.fromHeader(id),
    mailboxUid: 1,
    sender: 'idiomas@upb.edu.co',
    subject: 'Convocatoria examen de suficiencia',
    sentAt: new Date(sentAt),
    recipients: [],
    body: 'cuerpo original',
    attachments: [],
    ...overrides
  };
}

describe('DeduplicationPolicy', () => {
  let registry: InMemoryConsolidatedMessageRegistry;
  let policy: DeduplicationPolicy;

  beforeEach(() => {
    registry = new InMemoryConsolidatedMessageRegistry();
    policy = new DeduplicationPolicy(registry);
  });

  it('trata como nuevo un mensaje sin grupo previo', async () => {
    const decision = await policy.decide(message('<a@upb.edu.co>', '2026-09-10T08:00:00Z'), WINDOW_MS);
    expect(decision.kind).toBe('new');
  });

  it('consolida un reenvio con mismo remitente, asunto y cuerpo dentro de la ventana', async () => {
    const first = message('<a@upb.edu.co>', '2026-09-10T08:00:00Z');
    await registry.save({
      sender: first.sender,
      subject: first.subject,
      body: first.body,
      firstSentAt: first.sentAt,
      lastSentAt: first.sentAt,
      resendCount: 0
    });

    const resend = message('<b@upb.edu.co>', '2026-09-10T20:00:00Z'); // +12h
    const decision = await policy.decide(resend, WINDOW_MS);

    expect(decision.kind).toBe('consolidate');
  });

  it('trata como distinta una convocatoria con mismo asunto pero fuera de la ventana', async () => {
    const first = message('<a@upb.edu.co>', '2026-09-10T08:00:00Z');
    await registry.save({
      sender: first.sender,
      subject: first.subject,
      body: first.body,
      firstSentAt: first.sentAt,
      lastSentAt: first.sentAt,
      resendCount: 0
    });

    const later = message('<c@upb.edu.co>', '2026-09-11T08:00:01Z'); // +24h y 1s
    const decision = await policy.decide(later, WINDOW_MS);

    expect(decision.kind).toBe('new');
  });

  it('actualiza el documento existente cuando el reenvio trae el cuerpo modificado', async () => {
    const first = message('<a@upb.edu.co>', '2026-09-10T08:00:00Z');
    await registry.save({
      sender: first.sender,
      subject: first.subject,
      body: first.body,
      firstSentAt: first.sentAt,
      lastSentAt: first.sentAt,
      resendCount: 0
    });

    const resend = message('<d@upb.edu.co>', '2026-09-10T10:00:00Z', { body: 'cuerpo actualizado' });
    const decision = await policy.decide(resend, WINDOW_MS);

    expect(decision.kind).toBe('update-body');
    if (decision.kind === 'update-body') {
      expect(decision.existing.body).toBe('cuerpo original');
    }
  });

  it.each([
    { desc: 'justo en el borde de la ventana (exactamente windowMs)', offsetMs: WINDOW_MS, expected: 'consolidate' },
    { desc: 'un milisegundo dentro de la ventana', offsetMs: WINDOW_MS - 1, expected: 'consolidate' },
    { desc: 'un milisegundo fuera de la ventana', offsetMs: WINDOW_MS + 1, expected: 'new' }
  ])('borde de ventana: $desc', async ({ offsetMs, expected }) => {
    const first = message('<a@upb.edu.co>', '2026-09-10T08:00:00.000Z');
    await registry.save({
      sender: first.sender,
      subject: first.subject,
      body: first.body,
      firstSentAt: first.sentAt,
      lastSentAt: first.sentAt,
      resendCount: 0
    });

    const resend = message('<e@upb.edu.co>', new Date(first.sentAt.getTime() + offsetMs).toISOString());
    const decision = await policy.decide(resend, WINDOW_MS);

    expect(decision.kind).toBe(expected);
  });
});
