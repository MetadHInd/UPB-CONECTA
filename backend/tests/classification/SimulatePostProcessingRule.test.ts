import { describe, expect, it } from 'vitest';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import type { InstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import type { ClassificationResultRecord } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import type { PostProcessingRuleData } from '../../src/contexts/classification/domain/rules/PostProcessingRuleData.js';
import {
  SimulatePostProcessingRule,
  type LabeledHistoricalMessage
} from '../../src/contexts/classification/application/SimulatePostProcessingRule.js';

let sequence = 0;

function buildMessage(overrides: Partial<InstitutionalMessage> = {}): InstitutionalMessage {
  sequence += 1;
  return {
    messageId: MessageId.fromHeader(`<msg-sim-${sequence}@upb.edu.co>`),
    mailboxUid: sequence,
    sender: 'bienestar@upb.edu.co',
    subject: 'Convocatoria de bienestar con plazo de inscripcion',
    sentAt: new Date('2026-09-11T07:30:00Z'),
    recipients: ['estudiantes@upb.edu.co'],
    body: 'La convocatoria cierra el 30 de septiembre.',
    attachments: [],
    ...overrides
  };
}

function buildRecord(overrides: Partial<ClassificationResultRecord> = {}): ClassificationResultRecord {
  return {
    messageId: 'msg-1',
    proposedCategory: MessageCategory.CONVOCATORIA_CON_PLAZO,
    finalCategory: MessageCategory.CONVOCATORIA_CON_PLAZO,
    isKnownFalsePositiveCase: false,
    reason: null,
    appliedRuleId: null,
    persistedAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides
  };
}

describe('HU-09 — SimulatePostProcessingRule (RF-13, criterio 6)', () => {
  it('reporta que habria cambiado si la regla candidata ya hubiera estado activa', () => {
    const history: LabeledHistoricalMessage[] = [
      {
        message: buildMessage({ sender: 'bienestar@upb.edu.co' }),
        record: buildRecord({ messageId: 'msg-1', finalCategory: MessageCategory.CONVOCATORIA_CON_PLAZO })
      },
      {
        message: buildMessage({ sender: 'otra-oficina@upb.edu.co' }),
        record: buildRecord({ messageId: 'msg-2', finalCategory: MessageCategory.CONVOCATORIA_CON_PLAZO })
      }
    ];

    const candidate: PostProcessingRuleData = {
      id: 'r-candidata-boletin',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'correct', category: MessageCategory.BOLETIN_INFORMATIVO }
    };

    const result = new SimulatePostProcessingRule().execute(candidate, history);

    expect(result.totalEvaluated).toBe(2);
    expect(result.totalMatched).toBe(1);
    expect(result.totalChanged).toBe(1);
    expect(result.diffs).toEqual([
      {
        messageId: 'msg-1',
        historicalFinalCategory: MessageCategory.CONVOCATORIA_CON_PLAZO,
        simulatedOutcome: 'corrected',
        simulatedFinalCategory: MessageCategory.BOLETIN_INFORMATIVO,
        wouldChange: true
      }
    ]);
  });

  it('una correccion hacia la misma categoria ya vigente no cuenta como cambio', () => {
    const history: LabeledHistoricalMessage[] = [
      {
        message: buildMessage(),
        record: buildRecord({ messageId: 'msg-1', finalCategory: MessageCategory.BOLETIN_INFORMATIVO })
      }
    ];

    const candidate: PostProcessingRuleData = {
      id: 'r-sin-efecto',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'correct', category: MessageCategory.BOLETIN_INFORMATIVO }
    };

    const result = new SimulatePostProcessingRule().execute(candidate, history);

    expect(result.totalMatched).toBe(1);
    expect(result.totalChanged).toBe(0);
    expect(result.diffs[0]?.wouldChange).toBe(false);
  });

  it('una regla de descarte siempre cuenta como cambio y no devuelve categoria final simulada', () => {
    const history: LabeledHistoricalMessage[] = [
      {
        message: buildMessage(),
        record: buildRecord({ messageId: 'msg-1' })
      }
    ];

    const candidate: PostProcessingRuleData = {
      id: 'r-descarta-simulada',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'discard' }
    };

    const result = new SimulatePostProcessingRule().execute(candidate, history);

    expect(result.diffs).toEqual([
      {
        messageId: 'msg-1',
        historicalFinalCategory: MessageCategory.CONVOCATORIA_CON_PLAZO,
        simulatedOutcome: 'discarded',
        simulatedFinalCategory: null,
        wouldChange: true
      }
    ]);
  });

  it('no requiere que la regla candidata este guardada y no muta el historico recibido', () => {
    const history: LabeledHistoricalMessage[] = [
      { message: buildMessage(), record: buildRecord({ messageId: 'msg-1' }) }
    ];
    const snapshot = JSON.parse(JSON.stringify(history[0]?.record));

    const candidate: PostProcessingRuleData = {
      id: 'r-nunca-guardada',
      precedence: 5,
      active: true,
      condition: { type: 'subject-matches', pattern: 'convocatoria' },
      action: { type: 'confirm' }
    };

    new SimulatePostProcessingRule().execute(candidate, history);

    expect(JSON.parse(JSON.stringify(history[0]?.record))).toEqual(snapshot);
  });

  it('mensajes que no cumplen la condicion quedan fuera de los diffs', () => {
    const history: LabeledHistoricalMessage[] = [
      { message: buildMessage({ sender: 'nadie@upb.edu.co' }), record: buildRecord({ messageId: 'msg-x' }) }
    ];

    const candidate: PostProcessingRuleData = {
      id: 'r-no-aplica',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'discard' }
    };

    const result = new SimulatePostProcessingRule().execute(candidate, history);

    expect(result.totalEvaluated).toBe(1);
    expect(result.totalMatched).toBe(0);
    expect(result.diffs).toHaveLength(0);
  });
});
