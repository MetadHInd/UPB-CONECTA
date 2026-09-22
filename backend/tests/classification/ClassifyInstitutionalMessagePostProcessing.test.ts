import { describe, expect, it } from 'vitest';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import type { InstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';
import { ClassifyInstitutionalMessage } from '../../src/contexts/classification/application/ClassifyInstitutionalMessage.js';
import { SystemClock } from '../../src/contexts/classification/infrastructure/adapters/out/memory/SystemClock.js';
import { ClassificationResult } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import type { PostProcessingRuleData } from '../../src/contexts/classification/domain/rules/PostProcessingRuleData.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { InMemoryClassificationRetryQueue } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationRetryQueue.js';
import { InMemoryPostProcessingRuleRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryPostProcessingRuleRepository.js';

let sequence = 0;

function buildMessage(overrides: Partial<InstitutionalMessage> = {}): InstitutionalMessage {
  sequence += 1;
  return {
    messageId: MessageId.fromHeader(`<msg-pp-${sequence}@upb.edu.co>`),
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

describe('HU-09 — posprocesamiento integrado en ClassifyInstitutionalMessage', () => {
  it('criterio 3: una regla que corrige conserva propuesta, regla aplicada y categoria final', async () => {
    const resultRepository = new InMemoryClassificationResultRepository();
    const ruleRepository = new InMemoryPostProcessingRuleRepository();
    await ruleRepository.save({
      id: 'r-boletin-no-plazo',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'correct', category: MessageCategory.BOLETIN_INFORMATIVO }
    });

    const useCase = new ClassifyInstitutionalMessage({
      clock: new SystemClock(),
      classificationPort: {
        classify: async () => ClassificationResult.fromCategory(MessageCategory.CONVOCATORIA_CON_PLAZO)
      },
      resultRepository,
      ruleRepository
    });

    const message = buildMessage();
    const result = await useCase.execute(message);

    expect(result?.proposedCategory).toBe(MessageCategory.CONVOCATORIA_CON_PLAZO);
    expect(result?.finalCategory).toBe(MessageCategory.BOLETIN_INFORMATIVO);
    expect(result?.appliedRuleId).toBe('r-boletin-no-plazo');

    expect(resultRepository.items).toHaveLength(1);
    expect(resultRepository.items[0]).toMatchObject({
      proposedCategory: MessageCategory.CONVOCATORIA_CON_PLAZO,
      finalCategory: MessageCategory.BOLETIN_INFORMATIVO,
      appliedRuleId: 'r-boletin-no-plazo'
    });
  });

  it('una regla que confirma deja la categoria propuesta como definitiva y registra la regla', async () => {
    const resultRepository = new InMemoryClassificationResultRepository();
    const ruleRepository = new InMemoryPostProcessingRuleRepository();
    await ruleRepository.save({
      id: 'r-confirma-convocatoria',
      precedence: 10,
      active: true,
      condition: { type: 'subject-matches', pattern: 'convocatoria' },
      action: { type: 'confirm' }
    });

    const useCase = new ClassifyInstitutionalMessage({
      clock: new SystemClock(),
      classificationPort: {
        classify: async () => ClassificationResult.fromCategory(MessageCategory.CONVOCATORIA_CON_PLAZO)
      },
      resultRepository,
      ruleRepository
    });

    const result = await useCase.execute(buildMessage());

    expect(result?.finalCategory).toBe(MessageCategory.CONVOCATORIA_CON_PLAZO);
    expect(result?.appliedRuleId).toBe('r-confirma-convocatoria');
  });

  it('decision sobre "descartar": una regla que descarta envia el mensaje a la cola de reintento y no lo publica', async () => {
    const resultRepository = new InMemoryClassificationResultRepository();
    const retryQueue = new InMemoryClassificationRetryQueue();
    const ruleRepository = new InMemoryPostProcessingRuleRepository();
    await ruleRepository.save({
      id: 'r-descarta-cadena',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'discard' }
    });

    const useCase = new ClassifyInstitutionalMessage({
      clock: new SystemClock(),
      classificationPort: {
        classify: async () => ClassificationResult.fromCategory(MessageCategory.CONVOCATORIA_CON_PLAZO)
      },
      resultRepository,
      retryQueue,
      ruleRepository
    });

    const message = buildMessage();
    const result = await useCase.execute(message);

    expect(result).toBeNull();
    expect(resultRepository.items).toHaveLength(0);
    expect(retryQueue.items).toHaveLength(1);
    expect(retryQueue.items[0]).toMatchObject({
      messageId: message.messageId.toString(),
      discardedByRuleId: 'r-descarta-cadena',
      proposedCategory: MessageCategory.CONVOCATORIA_CON_PLAZO
    });
  });

  it('sin ninguna regla activa que coincida, el flujo persiste la propuesta del clasificador sin marca de regla', async () => {
    const resultRepository = new InMemoryClassificationResultRepository();
    const ruleRepository = new InMemoryPostProcessingRuleRepository();
    await ruleRepository.save({
      id: 'r-no-coincide',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^nunca@' },
      action: { type: 'discard' }
    });

    const useCase = new ClassifyInstitutionalMessage({
      clock: new SystemClock(),
      classificationPort: {
        classify: async () => ClassificationResult.fromCategory(MessageCategory.EVENTO)
      },
      resultRepository,
      ruleRepository
    });

    const result = await useCase.execute(buildMessage());

    expect(result?.finalCategory).toBe(MessageCategory.EVENTO);
    expect(result?.appliedRuleId).toBeUndefined();
    expect(resultRepository.items[0]?.appliedRuleId).toBeNull();
  });

  it('criterio 5: una regla agregada, editada o desactivada aplica en la siguiente ejecucion sin reconstruir el caso de uso', async () => {
    const resultRepository = new InMemoryClassificationResultRepository();
    const ruleRepository = new InMemoryPostProcessingRuleRepository();

    const useCase = new ClassifyInstitutionalMessage({
      clock: new SystemClock(),
      classificationPort: {
        classify: async () => ClassificationResult.fromCategory(MessageCategory.CONVOCATORIA_CON_PLAZO)
      },
      resultRepository,
      ruleRepository
    });

    const firstMessage = buildMessage();
    const beforeRule = await useCase.execute(firstMessage);
    expect(beforeRule?.finalCategory).toBe(MessageCategory.CONVOCATORIA_CON_PLAZO);
    expect(beforeRule?.appliedRuleId).toBeUndefined();

    await ruleRepository.save({
      id: 'r-agregada-en-caliente',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'correct', category: MessageCategory.BOLETIN_INFORMATIVO }
    });

    const secondMessage = buildMessage();
    const afterAdding = await useCase.execute(secondMessage);
    expect(afterAdding?.finalCategory).toBe(MessageCategory.BOLETIN_INFORMATIVO);
    expect(afterAdding?.appliedRuleId).toBe('r-agregada-en-caliente');

    await ruleRepository.save({
      id: 'r-agregada-en-caliente',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'correct', category: MessageCategory.EVENTO }
    });

    const thirdMessage = buildMessage();
    const afterEditing = await useCase.execute(thirdMessage);
    expect(afterEditing?.finalCategory).toBe(MessageCategory.EVENTO);
    expect(afterEditing?.appliedRuleId).toBe('r-agregada-en-caliente');

    await ruleRepository.setActive('r-agregada-en-caliente', false);

    const fourthMessage = buildMessage();
    const afterDisabling = await useCase.execute(fourthMessage);
    expect(afterDisabling?.finalCategory).toBe(MessageCategory.CONVOCATORIA_CON_PLAZO);
    expect(afterDisabling?.appliedRuleId).toBeUndefined();
  });

  it('no rompe el flujo existente de HU-06 cuando no se provee ruleRepository', async () => {
    const resultRepository = new InMemoryClassificationResultRepository();
    const useCase = new ClassifyInstitutionalMessage({
      clock: new SystemClock(),
      classificationPort: {
        classify: async () => ClassificationResult.fromCategory(MessageCategory.EVENTO)
      },
      resultRepository
    });

    const result = await useCase.execute(buildMessage());

    expect(result?.finalCategory).toBe(MessageCategory.EVENTO);
    expect(resultRepository.items).toHaveLength(1);
  });
});
