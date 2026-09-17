import { describe, expect, it } from 'vitest';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import { ClassifyInstitutionalMessage } from '../../src/contexts/classification/application/ClassifyInstitutionalMessage.js';
import { ClassificationCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { ClassificationResult } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import { InMemoryClassificationAdapter } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationAdapter.js';
import { InMemoryClassificationRetryQueue } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationRetryQueue.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';

const buildMessage = () => ({
  messageId: MessageId.fromHeader('<msg-001@upb.edu.co>'),
  mailboxUid: 101,
  sender: 'bienestar@upb.edu.co',
  subject: 'Boletín de bienestar',
  sentAt: new Date('2026-09-11T07:30:00Z'),
  recipients: ['estudiantes@upb.edu.co'],
  body: 'Informacion del programa de bienestar con inscripcion abierta.',
  attachments: []
});

describe('HU-06 — clasificación de mensajes institucionales', () => {
  it('asigna exactamente una categoria valida a un mensaje normalizado', async () => {
    const adapter = new InMemoryClassificationAdapter();
    const message = {
      ...buildMessage(),
      subject: 'Convocatoria para pasantias',
      body: 'La convocatoria cierra el 30 de septiembre. Presenta tu hoja de vida.'
    };

    const result = await adapter.classify(message);

    expect(result).toBeInstanceOf(ClassificationResult);
    expect(Object.values(ClassificationCategory)).toContain(result.proposedCategory);
    expect(result.proposedCategory).toBe(result.finalCategory);
  });

  it('guarda el mensaje sin clasificar en la cola de reintento cuando falla el servicio', async () => {
    const retryQueue = new InMemoryClassificationRetryQueue();
    const resultRepository = new InMemoryClassificationResultRepository();
    const useCase = new ClassifyInstitutionalMessage({
      classificationPort: {
        classify: async () => {
          throw new Error('timeout del proveedor de IA');
        }
      },
      resultRepository,
      retryQueue
    });

    const message = buildMessage();
    const result = await useCase.execute(message);

    expect(result).toBeNull();
    expect(retryQueue.items).toHaveLength(1);
    expect(retryQueue.items[0]?.message).toEqual(message);
    expect(resultRepository.items).toHaveLength(0);
  });

  it('conserva la categoria propuesta y la definitiva y registra el falso positivo del piloto', async () => {
    const adapter = new InMemoryClassificationAdapter();
    const message = buildMessage();

    const result = await adapter.classify(message);

    expect(result.proposedCategory).toBe(ClassificationCategory.BOLETIN_INFORMATIVO);
    expect(result.finalCategory).toBe(ClassificationCategory.BOLETIN_INFORMATIVO);
    expect(result.isKnownFalsePositiveCase).toBe(true);
  });
});
