import { MongoClient } from 'mongodb';
import { IngestInstitutionalMessages } from './contexts/ingestion/application/IngestInstitutionalMessages.js';
import { IdempotencyPolicy } from './contexts/ingestion/domain/services/IdempotencyPolicy.js';
import { DeduplicationPolicy } from './contexts/ingestion/domain/services/DeduplicationPolicy.js';
import { QuarantineIncidentPolicy } from './contexts/ingestion/domain/services/QuarantineIncidentPolicy.js';
import { readIngestionConfig } from './contexts/ingestion/infrastructure/config/IngestionConfig.js';
import { IngestionScheduler } from './contexts/ingestion/infrastructure/scheduler/IngestionScheduler.js';
import { MongoProcessedMessageRegistry } from './contexts/ingestion/infrastructure/adapters/out/mongo/MongoProcessedMessageRegistry.js';
import { MongoConsolidatedMessageRegistry } from './contexts/ingestion/infrastructure/adapters/out/mongo/MongoConsolidatedMessageRegistry.js';
import { MongoQuarantineRepository } from './contexts/ingestion/infrastructure/adapters/out/mongo/MongoQuarantineRepository.js';
import { MongoIngestionCursorRepository } from './contexts/ingestion/infrastructure/adapters/out/mongo/MongoIngestionCursorRepository.js';
import { MongoIngestionRunLogRepository } from './contexts/ingestion/infrastructure/adapters/out/mongo/MongoIngestionRunLogRepository.js';
import { InMemoryMailboxAdapter } from './contexts/ingestion/infrastructure/adapters/out/memory/InMemoryMailboxAdapter.js';
import { SystemClock } from './contexts/ingestion/infrastructure/adapters/out/memory/SystemClock.js';
import { MimeMessageNormalizerAdapter } from './contexts/ingestion/infrastructure/adapters/out/normalization/MimeMessageNormalizerAdapter.js';
import { SpanishDueDateExtractor } from './contexts/ingestion/infrastructure/extraction/SpanishDueDateExtractor.js';
import { buildFixtureMessages } from './contexts/ingestion/infrastructure/fixtures/institutionalMessages.js';
import { ClassifyInstitutionalMessage } from './contexts/classification/application/ClassifyInstitutionalMessage.js';
import { InMemoryClassificationAdapter } from './contexts/classification/infrastructure/adapters/out/memory/InMemoryClassificationAdapter.js';
import { InMemoryAdminAlertPort } from './contexts/classification/infrastructure/adapters/out/memory/InMemoryAdminAlertPort.js';
import { InMemoryNotificationSchedulingPort } from './contexts/classification/infrastructure/adapters/out/memory/InMemoryNotificationSchedulingPort.js';
import { MongoClassificationResultRepository } from './contexts/classification/infrastructure/adapters/out/mongo/MongoClassificationResultRepository.js';
import { MongoClassificationRetryQueue } from './contexts/classification/infrastructure/adapters/out/mongo/MongoClassificationRetryQueue.js';
import { MongoPostProcessingRuleRepository } from './contexts/classification/infrastructure/adapters/out/mongo/MongoPostProcessingRuleRepository.js';
import { MongoReviewThresholdConfig } from './contexts/classification/infrastructure/adapters/out/mongo/MongoReviewThresholdConfig.js';

/**
 * Raiz de composicion: unico lugar del sistema donde el dominio se encuentra
 * con la infraestructura concreta. Sustituir el adaptador simulado por el
 * cliente IMAP real cuando la Universidad habilite el buzon es un cambio de
 * una linea en este archivo, sin tocar dominio ni casos de uso (RNF-42).
 */
async function bootstrap(): Promise<void> {
  const config = readIngestionConfig();
  const client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
  await client.connect();
  const db = client.db(process.env['MONGODB_DATABASE'] ?? 'upb_conecta');

  await MongoProcessedMessageRegistry.ensureIndexes(db);
  await MongoConsolidatedMessageRegistry.ensureIndexes(db);
  await MongoIngestionRunLogRepository.ensureIndexes(db);
  await MongoClassificationResultRepository.ensureIndexes(db);
  await MongoPostProcessingRuleRepository.ensureIndexes(db);

  const clock = new SystemClock();
  const registry = new MongoProcessedMessageRegistry(db);
  const consolidatedRegistry = new MongoConsolidatedMessageRegistry(db);
  // ATENCION: al sustituir este adaptador por el cliente IMAP real, revisar
  // tambien la clasificacion de abajo. Con correo real, el clasificador
  // simulado (0.4 en el cubo por defecto) y el umbral por defecto (0.6)
  // retendrian en revision pendiente todo lo que no reconozca, y la alerta
  // al administrador es un stub que nadie lee: retencion silenciosa, justo lo
  // que HU-10 quiere evitar. Ver README de `classification`.
  const mailbox = new InMemoryMailboxAdapter(buildFixtureMessages());

  // Clasificacion completa: HU-06 (stub), reglas de HU-09 y umbral de HU-10.
  const classifyMessage = new ClassifyInstitutionalMessage({
    classificationPort: new InMemoryClassificationAdapter(),
    resultRepository: new MongoClassificationResultRepository(db),
    retryQueue: new MongoClassificationRetryQueue(db),
    ruleRepository: new MongoPostProcessingRuleRepository(db),
    reviewThresholdConfig: new MongoReviewThresholdConfig(db),
    adminAlertPort: new InMemoryAdminAlertPort(),
    notificationSchedulingPort: new InMemoryNotificationSchedulingPort(),
    clock
  });

  const useCase = new IngestInstitutionalMessages({
    mailbox,
    registry,
    consolidatedRegistry,
    quarantine: new MongoQuarantineRepository(db),
    cursors: new MongoIngestionCursorRepository(db),
    logs: new MongoIngestionRunLogRepository(db),
    idempotency: new IdempotencyPolicy(registry),
    deduplication: new DeduplicationPolicy(consolidatedRegistry),
    deduplicationWindowMs: config.deduplicationWindowMs,
    quarantineIncidentPolicy: new QuarantineIncidentPolicy(config.quarantineIncidentThresholdRatio),
    normalizer: new MimeMessageNormalizerAdapter(),
    dueDateExtractor: new SpanishDueDateExtractor(),
    classifyMessage,
    clock,
    batchSize: config.batchSize
  });

  const scheduler = new IngestionScheduler(useCase, () => readIngestionConfig(), (error) => {
    console.error('[ingesta] ciclo fallido:', error);
  });

  scheduler.start();
  process.on('SIGTERM', () => { scheduler.stop(); void client.close(); });
  process.on('SIGINT', () => { scheduler.stop(); void client.close(); });
}

bootstrap().catch((error) => {
  console.error('[ingesta] no fue posible iniciar el servicio:', error);
  process.exit(1);
});
