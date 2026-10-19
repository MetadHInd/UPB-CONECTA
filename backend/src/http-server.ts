import { MongoClient } from 'mongodb';
import { createHttpServer } from './infrastructure/http/server.js';
import { SystemClock } from './infrastructure/shared/SystemClock.js';

import { AuthenticateStudent } from './contexts/identity/application/AuthenticateStudent.js';
import { SessionTokenIssuer } from './contexts/identity/application/SessionTokenIssuer.js';
import { readSessionConfig } from './contexts/identity/infrastructure/config/SessionConfig.js';
import { readIdentityRateLimitConfig } from './contexts/identity/infrastructure/config/IdentityRateLimitConfig.js';
import { SessionPolicy } from './contexts/identity/domain/value-objects/SessionPolicy.js';
import { MongoIdentityProviderAdapter } from './contexts/identity/infrastructure/adapters/out/mongo/MongoIdentityProviderAdapter.js';
import { MongoAccountRoleRepository } from './contexts/identity/infrastructure/adapters/out/mongo/MongoAccountRoleRepository.js';
import { seedTestAccounts } from './contexts/identity/infrastructure/seed/TestAccountSeeder.js';
import { MongoRateLimiter } from './contexts/identity/infrastructure/adapters/out/mongo/MongoRateLimiter.js';
import { RedisRateLimiter } from './contexts/identity/infrastructure/adapters/out/redis/RedisRateLimiter.js';
import { FallbackRateLimiter } from './contexts/identity/infrastructure/adapters/out/FallbackRateLimiter.js';
import { RedisCachedRefreshTokenRepository } from './contexts/identity/infrastructure/adapters/out/redis/RedisCachedRefreshTokenRepository.js';
import { connectRedis, redisStatus } from './infrastructure/shared/redis.js';
import { JoseTokenSigningAdapter } from './contexts/identity/infrastructure/adapters/out/jwt/JoseTokenSigningAdapter.js';
import { RandomSessionIdGenerator } from './contexts/identity/infrastructure/adapters/out/crypto/RandomSessionIdGenerator.js';
import { MongoRefreshTokenRepository } from './contexts/identity/infrastructure/adapters/out/mongo/MongoRefreshTokenRepository.js';
import { FanOutProfileSync } from './contexts/identity/infrastructure/adapters/out/profile-sync/FanOutProfileSync.js';
import { ConsentStatusAdapter } from './contexts/identity/infrastructure/adapters/out/consent-status/ConsentStatusAdapter.js';
import { createAuthRouter } from './contexts/identity/infrastructure/http/authRoutes.js';
import { requireSession, sessionPrincipal } from './contexts/identity/infrastructure/http/requireSession.js';
import { RefreshSession } from './contexts/identity/application/RefreshSession.js';
import { LogoutSession } from './contexts/identity/application/LogoutSession.js';
import { VerifyAccessToken } from './contexts/identity/application/VerifyAccessToken.js';
import { ConsoleSecurityAuditLog } from './contexts/identity/infrastructure/adapters/out/console/ConsoleSecurityAuditLog.js';
import { NotificationsDeviceInvalidationAdapter } from './contexts/identity/infrastructure/adapters/out/device/NotificationsDeviceInvalidationAdapter.js';
import { InvalidateDevice } from './contexts/notifications/application/InvalidateDevice.js';
import { MongoDeviceRegistry } from './contexts/notifications/infrastructure/adapters/out/mongo/MongoDeviceRegistry.js';

import { StartConversation } from './contexts/messaging/application/StartConversation.js';
import { SendMessage } from './contexts/messaging/application/SendMessage.js';
import { ListConversations } from './contexts/messaging/application/ListConversations.js';
import { GetConversation } from './contexts/messaging/application/GetConversation.js';
import { ListMessagingStudents } from './contexts/messaging/application/ListMessagingStudents.js';
import { MongoConversationRepository } from './contexts/messaging/infrastructure/adapters/out/mongo/MongoConversationRepository.js';
import { RandomMessagingIdGenerator } from './contexts/messaging/infrastructure/adapters/out/crypto/RandomMessagingIdGenerator.js';
import { IdentityMessagingDirectoryAdapter } from './contexts/messaging/infrastructure/integration/IdentityMessagingDirectoryAdapter.js';
import { createMessagingRouter } from './contexts/messaging/infrastructure/http/messagingRoutes.js';

import { SyncStudentProfileFromDirectory } from './contexts/profile/application/SyncStudentProfileFromDirectory.js';
import { readProfileConfig } from './contexts/profile/infrastructure/config/ProfileConfig.js';
import { MongoStudentProfileRepository } from './contexts/profile/infrastructure/adapters/out/mongo/MongoStudentProfileRepository.js';
import { IdentityProfileSyncAdapter } from './contexts/profile/infrastructure/integration/IdentityProfileSyncAdapter.js';

import { SyncForumAuthor } from './contexts/forum/application/SyncForumAuthor.js';
import { MongoForumAuthorRepository } from './contexts/forum/infrastructure/adapters/out/mongo/MongoForumAuthorRepository.js';
import { IdentityForumAuthorSyncAdapter } from './contexts/forum/infrastructure/integration/IdentityForumAuthorSyncAdapter.js';

import { ViewStudentProfile } from './contexts/profile/application/ViewStudentProfile.js';
import { UpdateStudentProfile } from './contexts/profile/application/UpdateStudentProfile.js';
import { FeedStudentSegmentAdapter } from './contexts/profile/infrastructure/integration/FeedStudentSegmentAdapter.js';
import { createProfileRouter } from './contexts/profile/infrastructure/http/profileRoutes.js';
import { QueryStudentFeed } from './contexts/feed/application/QueryStudentFeed.js';
import { FeedCategoryAdapter } from './contexts/classification/infrastructure/integration/FeedCategoryAdapter.js';
import { GetStudentFeed } from './contexts/feed/application/GetStudentFeed.js';
import { GetSegmentedFeed } from './contexts/feed/application/GetSegmentedFeed.js';
import { MongoConvocatoriaRepository } from './contexts/feed/infrastructure/adapters/out/mongo/MongoConvocatoriaRepository.js';
import { createFeedRouter } from './contexts/feed/infrastructure/http/feedRoutes.js';
import { MongoProgramTargetingRepository } from './contexts/targeting/infrastructure/adapters/out/mongo/MongoProgramTargetingRepository.js';
import { FacultyProgramResolver } from './contexts/targeting/domain/services/FacultyProgramResolver.js';
import { MongoClassificationResultRepository } from './contexts/classification/infrastructure/adapters/out/mongo/MongoClassificationResultRepository.js';
import { MongoClassificationRetryQueue } from './contexts/classification/infrastructure/adapters/out/mongo/MongoClassificationRetryQueue.js';
import { ConverseWithChatbot } from './contexts/chatbot/application/ConverseWithChatbot.js';
import { AnswerStudentQuestion } from './contexts/chatbot/application/AnswerStudentQuestion.js';
import { InMemoryConversationContextStore } from './contexts/chatbot/infrastructure/adapters/out/memory/InMemoryConversationContextStore.js';
import { InMemoryEscalationLog } from './contexts/chatbot/infrastructure/adapters/out/memory/InMemoryEscalationLog.js';
import { ExtractiveChatbot } from './contexts/chatbot/infrastructure/adapters/out/extractive/ExtractiveChatbot.js';
import { loadOfficialChannel, loadOutOfScopePolicy } from './contexts/chatbot/infrastructure/config/JsonChatbotConfig.js';
import { KnowledgeContextBase } from './contexts/chatbot/infrastructure/integration/KnowledgeContextBase.js';
import { RegistryConvocatoriaReference } from './contexts/chatbot/infrastructure/integration/RegistryConvocatoriaReference.js';
import { createChatbotRouter } from './contexts/chatbot/infrastructure/http/chatbotRoutes.js';
import { RepositoryKnowledgeBase } from './contexts/knowledge/infrastructure/adapters/out/RepositoryKnowledgeBase.js';
import { MongoKnowledgeEntryRepository } from './contexts/knowledge/infrastructure/adapters/out/mongo/MongoKnowledgeEntryRepository.js';
import { MongoConsolidatedMessageRegistry } from './contexts/ingestion/infrastructure/adapters/out/mongo/MongoConsolidatedMessageRegistry.js';
import { loadProgramCatalog } from './contexts/targeting/infrastructure/config/JsonProgramCatalogProvider.js';
import { ProgramCatalogMatcher } from './contexts/targeting/domain/services/ProgramCatalogMatcher.js';

import { RequireConsentToProceed } from './contexts/consent/application/RequireConsentToProceed.js';
import { GetConsentStatus } from './contexts/consent/application/GetConsentStatus.js';
import { ConsentPolicy } from './contexts/consent/domain/services/ConsentPolicy.js';
import { MongoConsentRepository } from './contexts/consent/infrastructure/adapters/out/mongo/MongoConsentRepository.js';
import { loadPublishedConsentVersions } from './contexts/consent/infrastructure/config/JsonPublishedConsentVersions.js';

/**
 * Raiz de composicion del servidor HTTP. Deliberadamente separada de
 * `main.ts` (que arranca los planificadores de ingesta/avisos, un proceso de
 * fondo sin puertos HTTP): son dos procesos con ciclos de vida distintos —
 * el planificador corre siempre, el servidor HTTP atiende peticiones — y
 * mezclarlos en un solo `bootstrap()` haria que un fallo del uno arrastrara
 * al otro sin necesidad.
 *
 * Cablea el primer endpoint del contrato REST, `POST /auth/login`
 * (HU-43/44/45): `AuthenticateStudent` con el proveedor de identidad en
 * memoria (no existe todavia un directorio institucional real — ver
 * `RealIdentityProviderAdapter`, que siempre lanza), limitador de tasa en
 * memoria, emision de sesion firmada con `jose` sobre MongoDB, y el
 * `FanOutProfileSync` que HU-37/HU-30 ya declaraban en espera de este punto
 * de entrada: cada login sincroniza tanto el perfil de segmentacion
 * (`profile`) como el autor verificado del foro (`forum`).
 */
async function bootstrap(): Promise<void> {
  const client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
  await client.connect();
  const db = client.db(process.env['MONGODB_DATABASE'] ?? 'upb_conecta');

  await MongoRefreshTokenRepository.ensureIndexes(db);
  await MongoConsentRepository.ensureIndexes(db);
  await MongoConversationRepository.ensureIndexes(db);
  await MongoRateLimiter.ensureIndexes(db);
  await MongoDeviceRegistry.ensureIndexes(db);
  await MongoConvocatoriaRepository.ensureIndexes(db);
  await MongoProgramTargetingRepository.ensureIndexes(db);
  await MongoClassificationResultRepository.ensureIndexes(db);
  await MongoKnowledgeEntryRepository.ensureIndexes(db);
  await MongoConsolidatedMessageRegistry.ensureIndexes(db);

  const clock = new SystemClock();
  const sessionConfig = readSessionConfig();
  const sessionPolicy = SessionPolicy.create(sessionConfig);

  const programCatalog = await loadProgramCatalog();
  const programCatalogMatcher = new ProgramCatalogMatcher(programCatalog);
  const profileConfig = readProfileConfig();

  const studentProfiles = new MongoStudentProfileRepository(db, profileConfig.semesterBounds);
  const profileSync = new IdentityProfileSyncAdapter(
    new SyncStudentProfileFromDirectory({
      profiles: studentProfiles,
      clock,
      bounds: profileConfig.semesterBounds,
      programs: programCatalogMatcher
    })
  );

  const forumAuthorSync = new IdentityForumAuthorSyncAdapter(
    new SyncForumAuthor({
      authors: new MongoForumAuthorRepository(db),
      clock,
      programs: programCatalogMatcher
    })
  );

  const consentStatus = new ConsentStatusAdapter(
    new RequireConsentToProceed({
      getConsentStatus: new GetConsentStatus({
        repository: new MongoConsentRepository(db),
        policy: new ConsentPolicy()
      }),
      versions: loadPublishedConsentVersions()
    })
  );

  const signer = new JoseTokenSigningAdapter(sessionConfig, clock);
  // Redis es opcional (cache compartida entre replicas): sin REDIS_URL, o si
  // cae en marcha, todo funciona sobre MongoDB como antes.
  const redis = await connectRedis(process.env['REDIS_URL']);
  const mongoRefreshTokens = new MongoRefreshTokenRepository(db);
  const refreshTokens = redis === null ? mongoRefreshTokens : new RedisCachedRefreshTokenRepository(mongoRefreshTokens, redis);
  const securityAudit = new ConsoleSecurityAuditLog();
  const sessionTokenIssuer = new SessionTokenIssuer({
    signer,
    refreshTokens,
    clock,
    ids: new RandomSessionIdGenerator(),
    policy: sessionPolicy
  });

  // Las cuentas viven en MongoDB (`identity_users`) y su rol en
  // `identity_account_roles` (HU-46). Sustituir `MongoIdentityProviderAdapter`
  // por `RealIdentityProviderAdapter` (hoy un stub que siempre lanza) sigue
  // siendo el unico cambio necesario para conectar el directorio
  // institucional real — mismo principio de "adaptador reemplazable sin tocar
  // el caso de uso" que ya documenta `main.ts` para el buzon IMAP.
  const identityProvider = new MongoIdentityProviderAdapter(db);
  const accountRoles = new MongoAccountRoleRepository(db);

  // Cuentas de prueba, estudiantes y profesores (ver `TestAccountSeeder`). Solo
  // se crean si IDENTITY_SEED_TEST_USERS=true (local y staging): comparten una
  // contrasena publica, asi que NO deben sembrarse por defecto en produccion.
  // Solo crea las que falten, de forma segura con varias replicas arrancando a la vez.
  if (process.env['IDENTITY_SEED_TEST_USERS'] === 'true') {
    const seeded = await seedTestAccounts(identityProvider, accountRoles);
    console.log(`[http] cuentas de prueba: ${seeded.created.length} creadas, ${seeded.existing.length} ya existian`);
  }

  const mongoRateLimiter = new MongoRateLimiter(db, readIdentityRateLimitConfig());
  const authenticateStudent = new AuthenticateStudent({
    provider: identityProvider,
    // Estado compartido en MongoDB: el limite vale entre todas las replicas de la API.
    rateLimiter:
      redis === null
        ? mongoRateLimiter
        : new FallbackRateLimiter(new RedisRateLimiter(redis, readIdentityRateLimitConfig()), mongoRateLimiter),
    sessions: sessionTokenIssuer,
    profileSync: new FanOutProfileSync([profileSync, forumAuthorSync]),
    consentStatus,
    accountRoles
  });

  // HU-39, criterio 2: al cerrar sesion se da de baja el dispositivo de esa cuenta.
  const deviceRegistry = new MongoDeviceRegistry(db);
  const deviceInvalidation = new NotificationsDeviceInvalidationAdapter(
    deviceRegistry,
    new InvalidateDevice({ registry: deviceRegistry, clock })
  );

  const authRouter = createAuthRouter(authenticateStudent, {
    refresh: new RefreshSession({ signer, refreshTokens, audit: securityAudit, clock, sessions: sessionTokenIssuer }),
    logout: new LogoutSession({ signer, refreshTokens, audit: securityAudit, clock, devices: deviceInvalidation })
  });
  const sessionGuard = requireSession(new VerifyAccessToken({ signer, refreshTokens, audit: securityAudit, clock }));

  // Mensajeria profesor <-> estudiante: conversaciones en Atlas, nombre y rol
  // de cada participante leidos del directorio de `identity` en el servidor.
  const conversations = new MongoConversationRepository(db);
  const messagingDirectory = new IdentityMessagingDirectoryAdapter({ profiles: identityProvider, roles: accountRoles });
  const messagingIds = new RandomMessagingIdGenerator();
  const messagingRouter = createMessagingRouter(
    {
      listConversations: new ListConversations({ conversations }),
      getConversation: new GetConversation({ conversations }),
      startConversation: new StartConversation({ conversations, directory: messagingDirectory, clock, ids: messagingIds }),
      sendMessage: new SendMessage({ conversations, clock, ids: messagingIds }),
      listStudents: new ListMessagingStudents({ directory: messagingDirectory })
    },
    sessionGuard,
    (res) => sessionPrincipal(res).subject
  );

  // Feed segmentado (RF-17, 22) y perfil (RF-59, 60): el correo sale siempre del token.
  const principalEmail = (res: Parameters<typeof sessionPrincipal>[0]): string => sessionPrincipal(res).subject;
  const classificationResults = new MongoClassificationResultRepository(db);
  const feedRouter = createFeedRouter(
    {
      queryFeed: new QueryStudentFeed({
        feed: new GetStudentFeed({
          segments: new FeedStudentSegmentAdapter(studentProfiles),
          feed: new GetSegmentedFeed({
            convocatoriaRepo: new MongoConvocatoriaRepository(db),
            programTargetingRepo: new MongoProgramTargetingRepository(db),
            facultyResolver: new FacultyProgramResolver(programCatalog),
            classificationResultRepo: classificationResults,
            classificationRetryQueue: new MongoClassificationRetryQueue(db)
          })
        }),
        categories: new FeedCategoryAdapter(classificationResults),
        clock
      })
    },
    sessionGuard,
    principalEmail
  );
  const profileRouter = createProfileRouter(
    {
      viewProfile: new ViewStudentProfile({
        profiles: studentProfiles,
        bounds: profileConfig.semesterBounds,
        programs: programCatalogMatcher
      }),
      updateProfile: new UpdateStudentProfile({ profiles: studentProfiles, clock, bounds: profileConfig.semesterBounds }),
      findDirectoryRecord: async (email) => {
        const found = await identityProvider.findProfile(email);
        return found === null || found.semester === undefined
          ? null
          : { name: found.name, email: found.email, program: found.program, semester: found.semester };
      }
    },
    sessionGuard,
    principalEmail
  );

  // Chatbot (RF-65 a 69). El proveedor es extractivo (sin modelo de IA) y el
  // contexto de conversacion vive en memoria de la replica (ver README de `chatbot`).
  const chatbotRouter = createChatbotRouter(
    {
      converse: new ConverseWithChatbot({
        answer: new AnswerStudentQuestion({
          chatbot: new ExtractiveChatbot(),
          knowledgeBase: new KnowledgeContextBase(new RepositoryKnowledgeBase(new MongoKnowledgeEntryRepository(db))),
          convocatorias: new RegistryConvocatoriaReference(new MongoConsolidatedMessageRegistry(db)),
          escalations: new InMemoryEscalationLog(),
          clock,
          officialChannel: loadOfficialChannel(),
          outOfScope: loadOutOfScopePolicy()
        }),
        conversations: new InMemoryConversationContextStore(),
        clock,
        idleMs: 30 * 60 * 1000
      })
    },
    sessionGuard,
    (res) => sessionPrincipal(res).sessionId
  );

  let shuttingDown = false;
  const app = createHttpServer([authRouter, messagingRouter, feedRouter, profileRouter, chatbotRouter], {
    // Listo = no estamos apagando y MongoDB responde (con tope de 2 s para no colgar el sondeo).
    isReady: async () => {
      if (shuttingDown) return false;
      await Promise.race([
        db.command({ ping: 1 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('ping timeout')), 2000).unref())
      ]);
      return true;
    },
    // Redis informa su estado pero NO decide la disponibilidad: es una optimizacion con respaldo.
    details: () => ({ redis: redisStatus(redis) }),
    instanceId: process.env['RAILWAY_REPLICA_ID'] ?? process.env['HOSTNAME'] ?? 'local'
  });
  const port = Number(process.env['PORT'] ?? process.env['HTTP_PORT'] ?? 3000);
  const server = app.listen(port, () => {
    console.log(`[http] escuchando en el puerto ${port}`);
  });

  // Apagado ordenado (RNF-12): al recibir la senal /ready pasa a 503 y se
  // espera un margen (SHUTDOWN_GRACE_MS, 3 s por defecto) para que el
  // balanceador retire esta replica antes de cerrar el puerto; despues se
  // terminan las peticiones en vuelo y por ultimo se cierra MongoDB. Tope
  // duro de 15 s por si algo no termina.
  const graceMs = Number(process.env['SHUTDOWN_GRACE_MS'] ?? 3000);
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[http] ${signal}: apagando (margen ${graceMs} ms)`);
    setTimeout(() => process.exit(1), graceMs + 12_000).unref();
    setTimeout(() => {
      server.close(() => {
        redis?.destroy();
        void client.close().finally(() => process.exit(0));
      });
      server.closeIdleConnections();
    }, graceMs);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  console.error('[http] no fue posible iniciar el servidor:', error);
  process.exit(1);
});
