import { describe, expect, it } from 'vitest';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import type { InstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import type { PostProcessingRuleData } from '../../src/contexts/classification/domain/rules/PostProcessingRuleData.js';
import { applyPostProcessingRules } from '../../src/contexts/classification/domain/rules/PostProcessingRuleChain.js';

let sequence = 0;

function buildMessage(overrides: Partial<InstitutionalMessage> = {}): InstitutionalMessage {
  sequence += 1;
  return {
    messageId: MessageId.fromHeader(`<msg-${sequence}@upb.edu.co>`),
    mailboxUid: sequence,
    sender: 'bienestar@upb.edu.co',
    subject: 'Boletín informativo semanal',
    sentAt: new Date('2026-09-11T07:30:00Z'),
    recipients: ['estudiantes@upb.edu.co'],
    body: 'Contenido informativo sin plazo.',
    attachments: [],
    ...overrides
  };
}

describe('HU-09 — PostProcessingRuleChain (RF-13, RF-14)', () => {
  it('criterio 1: una regla sobre el remitente corrige la categoria propuesta', () => {
    const message = buildMessage({ sender: 'notificaciones-automaticas@upb.edu.co' });
    const rules: PostProcessingRuleData[] = [
      {
        id: 'r-sender-noreply',
        precedence: 10,
        active: true,
        condition: { type: 'sender-matches', pattern: '^notificaciones-automaticas@' },
        action: { type: 'correct', category: MessageCategory.BOLETIN_INFORMATIVO }
      }
    ];

    const outcome = applyPostProcessingRules(rules, message);

    expect(outcome).toEqual({
      kind: 'corrected',
      appliedRuleId: 'r-sender-noreply',
      category: MessageCategory.BOLETIN_INFORMATIVO
    });
  });

  it('criterio 1: una regla sobre el remitente puede confirmar la propuesta', () => {
    const message = buildMessage({ sender: 'convocatorias@upb.edu.co' });
    const rules: PostProcessingRuleData[] = [
      {
        id: 'r-sender-convocatorias',
        precedence: 10,
        active: true,
        condition: { type: 'sender-matches', pattern: '^convocatorias@' },
        action: { type: 'confirm' }
      }
    ];

    const outcome = applyPostProcessingRules(rules, message);

    expect(outcome).toEqual({ kind: 'confirmed', appliedRuleId: 'r-sender-convocatorias' });
  });

  it('criterio 2: una expresion sobre el asunto refuerza la clasificacion (confirma)', () => {
    const message = buildMessage({ subject: 'Convocatoria con plazo de inscripcion' });
    const rules: PostProcessingRuleData[] = [
      {
        id: 'r-subject-convocatoria',
        precedence: 10,
        active: true,
        condition: { type: 'subject-matches', pattern: 'convocatoria' },
        action: { type: 'confirm' }
      }
    ];

    expect(applyPostProcessingRules(rules, message)).toEqual({
      kind: 'confirmed',
      appliedRuleId: 'r-subject-convocatoria'
    });
  });

  it('criterio 2: una expresion sobre el asunto puede descartar la clasificacion', () => {
    const message = buildMessage({ subject: 'FWD: FWD: cadena reenviada sin relacion academica' });
    const rules: PostProcessingRuleData[] = [
      {
        id: 'r-subject-cadena',
        precedence: 10,
        active: true,
        condition: { type: 'subject-matches', pattern: '^FWD:' },
        action: { type: 'discard' }
      }
    ];

    expect(applyPostProcessingRules(rules, message)).toEqual({
      kind: 'discarded',
      appliedRuleId: 'r-subject-cadena'
    });
  });

  it('ninguna regla activa coincide: no-rule-applied', () => {
    const message = buildMessage({ subject: 'Aviso general', sender: 'otra@upb.edu.co' });
    const rules: PostProcessingRuleData[] = [
      {
        id: 'r-no-match',
        precedence: 10,
        active: true,
        condition: { type: 'sender-matches', pattern: '^nunca-coincide@' },
        action: { type: 'discard' }
      }
    ];

    expect(applyPostProcessingRules(rules, message)).toEqual({ kind: 'no-rule-applied' });
  });

  it('una regla desactivada no participa en la cadena', () => {
    const message = buildMessage({ sender: 'notificaciones-automaticas@upb.edu.co' });
    const rules: PostProcessingRuleData[] = [
      {
        id: 'r-disabled',
        precedence: 10,
        active: false,
        condition: { type: 'sender-matches', pattern: '^notificaciones-automaticas@' },
        action: { type: 'discard' }
      }
    ];

    expect(applyPostProcessingRules(rules, message)).toEqual({ kind: 'no-rule-applied' });
  });

  it('composicion and/or/not de condiciones', () => {
    const message = buildMessage({
      sender: 'bienestar@upb.edu.co',
      subject: 'Convocatoria de bienestar universitario'
    });
    const rules: PostProcessingRuleData[] = [
      {
        id: 'r-and',
        precedence: 10,
        active: true,
        condition: {
          type: 'and',
          conditions: [
            { type: 'sender-matches', pattern: '^bienestar@' },
            { type: 'not', condition: { type: 'subject-matches', pattern: 'boletin' } }
          ]
        },
        action: { type: 'correct', category: MessageCategory.CONVOCATORIA_CON_PLAZO }
      }
    ];

    expect(applyPostProcessingRules(rules, message)).toEqual({
      kind: 'corrected',
      appliedRuleId: 'r-and',
      category: MessageCategory.CONVOCATORIA_CON_PLAZO
    });
  });

  it('si la primera regla de la cadena no coincide, delega a la siguiente', () => {
    const message = buildMessage({ sender: 'convocatorias@upb.edu.co', subject: 'Aviso sin relacion' });
    const rules: PostProcessingRuleData[] = [
      {
        id: 'r-primero-no-coincide',
        precedence: 10,
        active: true,
        condition: { type: 'sender-matches', pattern: '^nunca@' },
        action: { type: 'discard' }
      },
      {
        id: 'r-segundo-si-coincide',
        precedence: 20,
        active: true,
        condition: { type: 'sender-matches', pattern: '^convocatorias@' },
        action: { type: 'confirm' }
      }
    ];

    expect(applyPostProcessingRules(rules, message)).toEqual({
      kind: 'confirmed',
      appliedRuleId: 'r-segundo-si-coincide'
    });
  });

  it('condicion "or": coincide si al menos una de las subcondiciones se cumple', () => {
    const message = buildMessage({ sender: 'movilidad@upb.edu.co', subject: 'Aviso sin plazo' });
    const rules: PostProcessingRuleData[] = [
      {
        id: 'r-or',
        precedence: 10,
        active: true,
        condition: {
          type: 'or',
          conditions: [
            { type: 'sender-matches', pattern: '^nunca@' },
            { type: 'sender-matches', pattern: '^movilidad@' }
          ]
        },
        action: { type: 'correct', category: MessageCategory.MOVILIDAD }
      }
    ];

    expect(applyPostProcessingRules(rules, message)).toEqual({
      kind: 'corrected',
      appliedRuleId: 'r-or',
      category: MessageCategory.MOVILIDAD
    });
  });

  it('criterio 4: con varias reglas en competencia, gana siempre la de menor precedencia, sin importar el orden de lectura', () => {
    const message = buildMessage({
      sender: 'bienestar@upb.edu.co',
      subject: 'Convocatoria con plazo para bienestar'
    });

    const highestPriority: PostProcessingRuleData = {
      id: 'r-b-subject',
      precedence: 10,
      active: true,
      condition: { type: 'subject-matches', pattern: 'convocatoria' },
      action: { type: 'correct', category: MessageCategory.CONVOCATORIA_CON_PLAZO }
    };
    const middlePriority: PostProcessingRuleData = {
      id: 'r-c-discard',
      precedence: 20,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'discard' }
    };
    const lowestPriority: PostProcessingRuleData = {
      id: 'r-a-confirm',
      precedence: 30,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'confirm' }
    };

    const orderings = [
      [highestPriority, middlePriority, lowestPriority],
      [lowestPriority, middlePriority, highestPriority],
      [middlePriority, highestPriority, lowestPriority]
    ];

    for (const rules of orderings) {
      expect(applyPostProcessingRules(rules, message)).toEqual({
        kind: 'corrected',
        appliedRuleId: 'r-b-subject',
        category: MessageCategory.CONVOCATORIA_CON_PLAZO
      });
    }
  });

  it('criterio 4: ante empate de precedencia, desempata por id ascendente de forma determinista', () => {
    const message = buildMessage({ sender: 'bienestar@upb.edu.co' });

    const ruleZ: PostProcessingRuleData = {
      id: 'z-rule',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'discard' }
    };
    const ruleA: PostProcessingRuleData = {
      id: 'a-rule',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'confirm' }
    };

    expect(applyPostProcessingRules([ruleZ, ruleA], message)).toEqual({
      kind: 'confirmed',
      appliedRuleId: 'a-rule'
    });
    expect(applyPostProcessingRules([ruleA, ruleZ], message)).toEqual({
      kind: 'confirmed',
      appliedRuleId: 'a-rule'
    });
  });

  it('un patron invalido no rompe la cadena: la regla simplemente nunca coincide', () => {
    const message = buildMessage();
    const rules: PostProcessingRuleData[] = [
      {
        id: 'r-invalid-regex',
        precedence: 10,
        active: true,
        condition: { type: 'subject-matches', pattern: '(' },
        action: { type: 'discard' }
      }
    ];

    expect(applyPostProcessingRules(rules, message)).toEqual({ kind: 'no-rule-applied' });
  });
});
