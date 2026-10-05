import { describe, it, expect } from 'vitest';
import { ImapMailboxAdapter } from '../../src/contexts/ingestion/infrastructure/adapters/out/imap/ImapMailboxAdapter.js';
import type { ImapClient, ImapEnvelope } from '../../src/contexts/ingestion/infrastructure/adapters/out/imap/ImapMailboxAdapter.js';
import { MailboxUnavailableError } from '../../src/contexts/ingestion/domain/ports/out/MailboxIngestionPort.js';
import { IngestionCursor } from '../../src/contexts/ingestion/domain/value-objects/IngestionCursor.js';

function envelope(uid: number, messageId: string | undefined): ImapEnvelope {
  return {
    uid,
    headers: messageId === undefined ? {} : { 'message-id': messageId },
    from: 'idiomas@upb.edu.co',
    subject: 'Convocatoria',
    date: new Date('2026-08-03T13:05:00Z'),
    source: '<p>cuerpo</p>'
  };
}

function client(envelopes: ImapEnvelope[], failOn?: 'connect' | 'fetch'): ImapClient {
  return {
    connect: async () => { if (failOn === 'connect') throw new Error('conexion rechazada'); },
    logout: async () => {},
    openMailbox: async () => {},
    fetchSince: async () => { if (failOn === 'fetch') throw new Error('tiempo de espera agotado'); return envelopes; }
  };
}

describe('ImapMailboxAdapter como capa anticorrupcion', () => {
  it('traduce el sobre del proveedor a la entidad del dominio', async () => {
    const adapter = new ImapMailboxAdapter(client([envelope(101, '<a@upb.edu.co>')]), 'INBOX');
    const messages = await adapter.fetchUnprocessed(IngestionCursor.initial(), 200);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId.toString()).toBe('a@upb.edu.co');
    expect(messages[0]?.mailboxUid).toBe(101);
  });

  it('reporta el mensaje sin identidad y continua con el resto del lote', async () => {
    const reportados: { mailboxUid: number; rawSource: string }[] = [];
    const adapter = new ImapMailboxAdapter(
      client([envelope(101, '<a@upb.edu.co>'), envelope(102, undefined), envelope(103, '<c@upb.edu.co>')]),
      'INBOX',
      (m) => reportados.push({ mailboxUid: m.mailboxUid, rawSource: m.rawSource })
    );

    const messages = await adapter.fetchUnprocessed(IngestionCursor.initial(), 200);
    expect(messages).toHaveLength(2);
    expect(reportados).toEqual([{ mailboxUid: 102, rawSource: '<p>cuerpo</p>' }]);
  });

  it('traduce cualquier fallo de red a MailboxUnavailableError', async () => {
    const porConexion = new ImapMailboxAdapter(client([], 'connect'), 'INBOX');
    await expect(porConexion.fetchUnprocessed(IngestionCursor.initial(), 200)).rejects.toThrow(MailboxUnavailableError);

    const porLectura = new ImapMailboxAdapter(client([], 'fetch'), 'INBOX');
    await expect(porLectura.fetchUnprocessed(IngestionCursor.initial(), 200)).rejects.toThrow(MailboxUnavailableError);
  });
});
