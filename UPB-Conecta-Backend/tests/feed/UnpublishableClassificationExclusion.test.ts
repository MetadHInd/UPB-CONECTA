import { describe, expect, it } from 'vitest';
import { ClassifyInstitutionalMessage } from '../../src/contexts/classification/application/ClassifyInstitutionalMessage.js';
import { ClassificationResult } from '../../src/contexts/classification/domain/entities/ClassificationResult.js';
import { MessageCategory } from '../../src/contexts/classification/domain/value-objects/MessageCategory.js';
import { InMemoryClassificationResultRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationResultRepository.js';
import { InMemoryClassificationRetryQueue } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationRetryQueue.js';
import { InMemoryPostProcessingRuleRepository } from '../../src/contexts/classification/infrastructure/adapters/out/memory/InMemoryPostProcessingRuleRepository.js';
import { GetSegmentedFeed } from '../../src/contexts/feed/application/GetSegmentedFeed.js';
import type { ConvocatoriaEntry } from '../../src/contexts/feed/domain/ports/out/ConvocatoriaRepositoryPort.js';
import type { InstitutionalMessage } from '../../src/contexts/ingestion/domain/entities/InstitutionalMessage.js';
import { MessageId } from '../../src/contexts/ingestion/domain/value-objects/MessageId.js';
import { FacultyProgramResolver } from '../../src/contexts/targeting/domain/services/FacultyProgramResolver.js';
import { InMemoryProgramTargetingRepository } from '../../src/contexts/targeting/infrastructure/adapters/out/memory/InMemoryProgramTargetingRepository.js';

const NOW = new Date('2026-09-22T12:00:00Z');

function message(id: string, sender = 'oficina@upb.edu.co'): InstitutionalMessage {
  return {
    messageId: MessageId.fromHeader(`<${id}@upb.edu.co>`),
    mailboxUid: 1,
    sender,
    subject: 'Convocatoria',
    sentAt: NOW,
    recipients: ['estudiantes@upb.edu.co'],
    body: 'Texto.',
    attachments: []
  };
}

function setup() {
  const resultRepository = new InMemoryClassificationResultRepository();
  const retryQueue = new InMemoryClassificationRetryQueue();
  const ruleRepository = new InMemoryPostProcessingRuleRepository();
  const entries: ConvocatoriaEntry[] = [];
  const classifier = (classify: (m: InstitutionalMessage) => Promise<ClassificationResult>) =>
    new ClassifyInstitutionalMessage({
      classificationPort: { classify },
      resultRepository,
      retryQueue,
      ruleRepository,
      clock: { now: () => NOW }
    });
  const feed = new GetSegmentedFeed({
    convocatoriaRepo: { findSegmentedFeed: async () => entries },
    programTargetingRepo: new InMemoryProgramTargetingRepository(),
    facultyResolver: new FacultyProgramResolver({ faculties: [], programs: [] }),
    classificationResultRepo: resultRepository,
    classificationRetryQueue: retryQueue
  });
  return {
    resultRepository,
    retryQueue,
    ruleRepository,
    classifier,
    addConvocatoria(id: string, msg: InstitutionalMessage) {
      entries.push({ id, record: { representativeMessageId: msg.messageId.toString() } as ConvocatoriaEntry['record'] });
    },
    async visibleIds() {
      return (await feed.execute({ program: 'sistemas', semester: 5 })).feed.map((entry) => entry.id);
    }
  };
}

const publishable = async () => ClassificationResult.fromCategory(MessageCategory.CONVOCATORIA_CON_PLAZO);

describe('Corrección bug 1 — el feed no muestra lo que se intentó clasificar y no es publicable', () => {
  it('un mensaje cuyo clasificador falló no aparece en el feed', async () => {
    const env = setup();
    const failed = message('fallido');
    await env.classifier(async () => {
      throw new Error('timeout del proveedor');
    }).execute(failed);
    env.addConvocatoria('c-fallido', failed);

    expect(env.resultRepository.items).toHaveLength(0);
    expect(env.retryQueue.items).toHaveLength(1);
    expect(await env.visibleIds()).toEqual([]);
  });

  it('un mensaje descartado por una regla de HU-09 no aparece en el feed', async () => {
    const env = setup();
    await env.ruleRepository.save({
      id: 'r-descarta',
      precedence: 1,
      active: true,
      condition: { type: 'sender-matches', pattern: '^bienestar@' },
      action: { type: 'discard' }
    });
    const discarded = message('descartado', 'bienestar@upb.edu.co');
    await env.classifier(publishable).execute(discarded);
    env.addConvocatoria('c-descartado', discarded);

    expect(env.retryQueue.items[0]?.discardedByRuleId).toBe('r-descarta');
    expect(await env.visibleIds()).toEqual([]);
  });

  it('un mensaje que nunca pasó por el clasificador (histórico de HU-01 a HU-05) sigue visible', async () => {
    const env = setup();
    env.addConvocatoria('c-historico', message('historico'));

    expect(await env.visibleIds()).toEqual(['c-historico']);
  });

  it('el registro de clasificación manda sobre la cola: si luego se clasifica y publica, vuelve a verse', async () => {
    const env = setup();
    const msg = message('reintentado');
    await env.classifier(async () => {
      throw new Error('timeout');
    }).execute(msg);
    env.addConvocatoria('c-reintentado', msg);
    expect(await env.visibleIds()).toEqual([]);

    await env.classifier(publishable).execute(msg);

    expect(env.retryQueue.items).toHaveLength(1); // la entrada vieja sigue en la cola
    expect(await env.visibleIds()).toEqual(['c-reintentado']);
  });

  it('un mensaje publicado se ve y uno en revisión pendiente no, como antes', async () => {
    const env = setup();
    const published = message('publicado');
    const pending = message('pendiente');
    await env.classifier(publishable).execute(published);
    await env.resultRepository.save(
      ClassificationResult.fromCategory(MessageCategory.EVENTO).toPersistedRecord(pending.messageId.toString(), NOW, 'pending-review')
    );
    env.addConvocatoria('c-publicado', published);
    env.addConvocatoria('c-pendiente', pending);

    expect(await env.visibleIds()).toEqual(['c-publicado']);
  });

  describe('reenvíos: el mensaje nuevo pasa a ser el representativo del grupo', () => {
    it('si el proveedor falla al reclasificar el reenvío, la convocatoria ya publicada no desaparece', async () => {
      const env = setup();
      const original = message('original');
      const resend = message('reenvio');
      await env.classifier(publishable).execute(original);

      await env.classifier(async () => {
        throw new Error('timeout del proveedor');
      }).execute(resend, original.messageId.toString());
      env.addConvocatoria('c-grupo', resend);

      expect(await env.visibleIds()).toEqual(['c-grupo']);
      expect(env.retryQueue.items).toHaveLength(1); // el fallo sigue registrado para diagnóstico
      expect(await env.resultRepository.findByMessageId(resend.messageId.toString())).toMatchObject({
        publicationStatus: 'published',
        finalCategory: MessageCategory.CONVOCATORIA_CON_PLAZO,
        reason: expect.stringContaining('Heredado')
      });
    });

    it('un reenvío de algo retenido en revisión sigue retenido si su reclasificación falla', async () => {
      const env = setup();
      const original = message('original-pendiente');
      const resend = message('reenvio-pendiente');
      await env.resultRepository.save(
        ClassificationResult.fromCategory(MessageCategory.EVENTO).toPersistedRecord(original.messageId.toString(), NOW, 'pending-review')
      );

      await env.classifier(async () => {
        throw new Error('timeout');
      }).execute(resend, original.messageId.toString());
      env.addConvocatoria('c-grupo', resend);

      expect(await env.visibleIds()).toEqual([]);
    });

    it('si una regla descarta el reenvío, se oculta aunque el original estuviera publicado', async () => {
      const env = setup();
      await env.ruleRepository.save({
        id: 'r-descarta',
        precedence: 1,
        active: true,
        condition: { type: 'sender-matches', pattern: '^bienestar@' },
        action: { type: 'discard' }
      });
      const original = message('original-b');
      await env.resultRepository.save(
        ClassificationResult.fromCategory(MessageCategory.EVENTO).toPersistedRecord(original.messageId.toString(), NOW, 'published')
      );
      const resend = message('reenvio-b', 'bienestar@upb.edu.co');

      await env.classifier(publishable).execute(resend, original.messageId.toString());
      env.addConvocatoria('c-grupo', resend);

      expect(await env.visibleIds()).toEqual([]);
    });

    it('un reenvío cuyo original tampoco tenía resultado queda oculto por el fallo', async () => {
      const env = setup();
      const resend = message('reenvio-c');

      await env.classifier(async () => {
        throw new Error('timeout');
      }).execute(resend, message('original-c').messageId.toString());
      env.addConvocatoria('c-grupo', resend);

      expect(await env.visibleIds()).toEqual([]);
    });
  });

  it('exige la cola de reintento y el repositorio de resultados juntos: medio cableado reabriría el bug', () => {
    expect(
      () =>
        new GetSegmentedFeed({
          convocatoriaRepo: { findSegmentedFeed: async () => [] },
          programTargetingRepo: new InMemoryProgramTargetingRepository(),
          facultyResolver: new FacultyProgramResolver({ faculties: [], programs: [] }),
          classificationResultRepo: new InMemoryClassificationResultRepository()
        } as never)
    ).toThrow(/se configuran juntos/);
    expect(
      () =>
        new GetSegmentedFeed({
          convocatoriaRepo: { findSegmentedFeed: async () => [] },
          programTargetingRepo: new InMemoryProgramTargetingRepository(),
          facultyResolver: new FacultyProgramResolver({ faculties: [], programs: [] }),
          classificationRetryQueue: new InMemoryClassificationRetryQueue()
        } as never)
    ).toThrow(/se configuran juntos/);
  });
});
