import { describe, expect, it } from 'vitest';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import type { InstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';
import { ClassifyInstitutionalMessage } from '../../src/contexts/classification/application/ClassifyInstitutionalMessage.js';
import { ClassificationResult } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { ConfidenceScore } from '../../src/contexts/classification/domain/value-objects/ConfidenceScore.js';
import { ReviewThreshold } from '../../src/contexts/classification/domain/value-objects/ReviewThreshold.js';
import { InMemoryClassificationAdapter } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationAdapter.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { InMemoryReviewThresholdConfig } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryReviewThresholdConfig.js';
import { InMemoryAdminAlertPort } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryAdminAlertPort.js';
import { InMemoryNotificationSchedulingPort } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryNotificationSchedulingPort.js';
import { InMemoryPostProcessingRuleRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryPostProcessingRuleRepository.js';

let sequence = 0;

function buildMessage(overrides: Partial<InstitutionalMessage> = {}): InstitutionalMessage {
  sequence += 1;
  return {
    messageId: MessageId.fromHeader(`<msg-hu10-${sequence}@upb.edu.co>`),
    mailboxUid: sequence,
    sender: 'convocatorias@upb.edu.co',
    subject: 'Convocatoria con plazo',
    sentAt: new Date('2026-09-11T07:30:00Z'),
    recipients: ['estudiantes@upb.edu.co'],
    body: 'La convocatoria cierra el 30 de septiembre.',
    attachments: [],
    ...overrides
  };
}

function classifierReturning(score: number, category = MessageCategory.CONVOCATORIA_CON_PLAZO) {
  return {
    classify: async () => ClassificationResult.fromCategory(category, { confidenceScore: ConfidenceScore.of(score) })
  };
}

function buildUseCase(score: number, threshold = 0.6) {
  const resultRepository = new InMemoryClassificationResultRepository();
  const reviewThresholdConfig = new InMemoryReviewThresholdConfig(ReviewThreshold.of(threshold));
  const adminAlertPort = new InMemoryAdminAlertPort();
  const notificationSchedulingPort = new InMemoryNotificationSchedulingPort();
  const useCase = new ClassifyInstitutionalMessage({
    classificationPort: classifierReturning(score),
    resultRepository,
    reviewThresholdConfig,
    adminAlertPort,
    notificationSchedulingPort
  });
  return { useCase, resultRepository, reviewThresholdConfig, adminAlertPort, notificationSchedulingPort };
}

describe('HU-10 — umbral de revision integrado en ClassifyInstitutionalMessage', () => {
  it('criterio 1: la clasificacion persiste un puntaje de confianza numerico junto al documento', async () => {
    const { useCase, resultRepository } = buildUseCase(0.83);

    await useCase.execute(buildMessage());

    expect(resultRepository.items[0]?.confidenceScore).toBe(0.83);
  });

  it('criterio 2: por debajo del umbral queda en revision pendiente, se alerta al administrador y no se programan notificaciones', async () => {
    const { useCase, resultRepository, adminAlertPort, notificationSchedulingPort } = buildUseCase(0.4);
    const message = buildMessage();

    await useCase.execute(message);

    expect(resultRepository.items[0]?.publicationStatus).toBe('pending-review');
    expect(adminAlertPort.alerts).toHaveLength(1);
    expect(adminAlertPort.alerts[0]?.messageId).toBe(message.messageId.toString());
    expect(notificationSchedulingPort.scheduled).toHaveLength(0);
  });

  it('criterio 3: sobre el umbral se publica y se programan sus notificaciones, sin alertar al administrador', async () => {
    const { useCase, resultRepository, adminAlertPort, notificationSchedulingPort } = buildUseCase(0.9);
    const message = buildMessage();

    await useCase.execute(message);

    expect(resultRepository.items[0]?.publicationStatus).toBe('published');
    expect(notificationSchedulingPort.scheduled).toHaveLength(1);
    expect(notificationSchedulingPort.scheduled[0]?.messageId).toBe(message.messageId.toString());
    expect(adminAlertPort.alerts).toHaveLength(0);
  });

  it('criterio 4: ajustar el umbral aplica a la siguiente clasificacion sin reconstruir el caso de uso', async () => {
    const { useCase, resultRepository, reviewThresholdConfig } = buildUseCase(0.7, 0.6);

    await useCase.execute(buildMessage());
    expect(resultRepository.items[0]?.publicationStatus).toBe('published');

    await reviewThresholdConfig.set(ReviewThreshold.of(0.8));

    await useCase.execute(buildMessage());
    expect(resultRepository.items[1]?.publicationStatus).toBe('pending-review');

    await reviewThresholdConfig.set(ReviewThreshold.of(0.5));

    await useCase.execute(buildMessage());
    expect(resultRepository.items[2]?.publicationStatus).toBe('published');
  });

  it('criterio 7: un documento publicado conserva categoria propuesta, puntaje y regla que la corrigio', async () => {
    const resultRepository = new InMemoryClassificationResultRepository();
    const ruleRepository = new InMemoryPostProcessingRuleRepository();
    await ruleRepository.save({
      id: 'r-corrige-a-beca',
      precedence: 10,
      active: true,
      condition: { type: 'sender-matches', pattern: '^convocatorias@' },
      action: { type: 'correct', category: MessageCategory.BECA }
    });

    const useCase = new ClassifyInstitutionalMessage({
      classificationPort: classifierReturning(0.75),
      resultRepository,
      ruleRepository,
      reviewThresholdConfig: new InMemoryReviewThresholdConfig(ReviewThreshold.of(0.6))
    });

    await useCase.execute(buildMessage());

    expect(resultRepository.items[0]).toMatchObject({
      proposedCategory: MessageCategory.CONVOCATORIA_CON_PLAZO,
      finalCategory: MessageCategory.BECA,
      appliedRuleId: 'r-corrige-a-beca',
      confidenceScore: 0.75,
      publicationStatus: 'published'
    });
  });

  it('criterio 7: una regla que confirma conserva el puntaje original del modelo', async () => {
    const resultRepository = new InMemoryClassificationResultRepository();
    const ruleRepository = new InMemoryPostProcessingRuleRepository();
    await ruleRepository.save({
      id: 'r-confirma',
      precedence: 10,
      active: true,
      condition: { type: 'subject-matches', pattern: 'convocatoria' },
      action: { type: 'confirm' }
    });

    const useCase = new ClassifyInstitutionalMessage({
      classificationPort: classifierReturning(0.42),
      resultRepository,
      ruleRepository
    });

    await useCase.execute(buildMessage());

    expect(resultRepository.items[0]).toMatchObject({ appliedRuleId: 'r-confirma', confidenceScore: 0.42 });
  });

  it('sin umbral configurado se publica todo, como antes de HU-10', async () => {
    const resultRepository = new InMemoryClassificationResultRepository();
    const useCase = new ClassifyInstitutionalMessage({
      classificationPort: classifierReturning(0.1),
      resultRepository
    });

    await useCase.execute(buildMessage());

    expect(resultRepository.items[0]).toMatchObject({ confidenceScore: 0.1, publicationStatus: 'published' });
  });

  it('decision 5: el stub en memoria asigna un puntaje determinista (0.9 con patron, 0.4 por defecto)', async () => {
    const adapter = new InMemoryClassificationAdapter();

    const matched = await adapter.classify(buildMessage({ subject: 'Convocatoria abierta', body: 'Cierre el viernes.' }));
    const fallback = await adapter.classify(buildMessage({ subject: 'Saludo', body: 'Texto sin patrones.' }));
    const fallbackAgain = await adapter.classify(buildMessage({ subject: 'Saludo', body: 'Texto sin patrones.' }));

    expect(matched.confidenceScore.value).toBe(0.9);
    expect(fallback.finalCategory).toBe(MessageCategory.BOLETIN_INFORMATIVO);
    expect(fallback.confidenceScore.value).toBe(0.4);
    expect(fallbackAgain.confidenceScore.value).toBe(fallback.confidenceScore.value);
  });
});
