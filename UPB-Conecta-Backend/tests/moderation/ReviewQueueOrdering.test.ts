import { describe, expect, it } from 'vitest';
import { prioritizeReviewQueue } from '../../src/contexts/moderation/domain/services/ReviewQueueOrdering.js';
import type { PendingReviewQueueItem, QuarantineQueueItem } from '../../src/contexts/moderation/domain/entities/ReviewQueueItem.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';

const NOW = new Date('2026-09-23T12:00:00Z');
const CONVOCATORIA_ID = { sender: 's@upb.edu.co', subject: 'x', firstSentAt: new Date('2026-09-01T00:00:00Z') };

function quarantineItem(mailboxUid: number, detectedAt: Date): QuarantineQueueItem {
  return {
    ref: { kind: 'quarantine', mailboxUid },
    cause: 'sin Message-ID',
    rawSource: 'raw',
    normalizedContent: null,
    proposedCategory: null,
    confidenceScore: null,
    dueDate: null,
    detectedAt
  };
}

function pendingItem(messageId: string, detectedAt: Date, dueDate: PendingReviewQueueItem['dueDate']): PendingReviewQueueItem {
  return {
    ref: { kind: 'pending-review', messageId },
    convocatoriaId: CONVOCATORIA_ID,
    cause: 'confianza baja',
    rawSource: null,
    normalizedContent: 'cuerpo normalizado',
    proposedCategory: MessageCategory.CONVOCATORIA_CON_PLAZO,
    confidenceScore: 0.3,
    dueDate,
    detectedAt
  };
}

describe('prioritizeReviewQueue (HU-49, criterios 5 y 6)', () => {
  it('criterio 5: ordena por fecha de cierre mas proxima primero', () => {
    const lejana = pendingItem('m1', NOW, { kind: 'con-fecha', date: new Date('2026-12-01T00:00:00Z') });
    const proxima = pendingItem('m2', NOW, { kind: 'con-fecha', date: new Date('2026-09-25T00:00:00Z') });
    const media = pendingItem('m3', NOW, { kind: 'con-fecha', date: new Date('2026-10-15T00:00:00Z') });

    const result = prioritizeReviewQueue([lejana, proxima, media], NOW, Number.POSITIVE_INFINITY);

    expect(result.map((r) => r.item.ref)).toEqual([proxima.ref, media.ref, lejana.ref]);
  });

  it('criterio 5: los elementos sin fecha de cierre cierta van al final (cuarentena, sin-vencimiento, ambigua)', () => {
    const conFecha = pendingItem('m1', NOW, { kind: 'con-fecha', date: new Date('2026-10-01T00:00:00Z') });
    const cuarentena = quarantineItem(1, NOW);
    const sinVencimiento = pendingItem('m2', NOW, { kind: 'sin-vencimiento' });
    const ambigua = pendingItem('m3', NOW, { kind: 'ambigua', candidates: [], reason: 'dos fechas posibles' });

    const result = prioritizeReviewQueue([cuarentena, sinVencimiento, ambigua, conFecha], NOW, Number.POSITIVE_INFINITY);

    expect(result[0]?.item.ref).toEqual(conFecha.ref);
    expect(result.slice(1).map((r) => r.item.ref)).toEqual(
      expect.arrayContaining([cuarentena.ref, sinVencimiento.ref, ambigua.ref])
    );
  });

  it('criterio 6: un elemento que lleva al menos criticalAgeMs sin resolverse se marca critico', () => {
    const viejo = quarantineItem(1, new Date(NOW.getTime() - 100_000));
    const nuevo = quarantineItem(2, new Date(NOW.getTime() - 10_000));

    const result = prioritizeReviewQueue([viejo, nuevo], NOW, 50_000);

    const viejoResult = result.find((r) => r.item.ref.kind === 'quarantine' && r.item.ref.mailboxUid === 1);
    const nuevoResult = result.find((r) => r.item.ref.kind === 'quarantine' && r.item.ref.mailboxUid === 2);
    expect(viejoResult?.isCritical).toBe(true);
    expect(nuevoResult?.isCritical).toBe(false);
  });

  it('criterio 6: limite exacto — exactamente criticalAgeMs cuenta como critico (no estrictamente mayor)', () => {
    const item = quarantineItem(1, new Date(NOW.getTime() - 50_000));

    const result = prioritizeReviewQueue([item], NOW, 50_000);

    expect(result[0]?.isCritical).toBe(true);
  });
});
