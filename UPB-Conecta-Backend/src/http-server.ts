import { MongoClient } from 'mongodb';
import { createHttpServer } from './infrastructure/http/server.js';
import { SystemClock } from './infrastructure/shared/SystemClock.js';

import { AuthenticateStudent } from './contexts/identity/application/AuthenticateStudent.js';
import { SessionTokenIssuer } from './contexts/identity/application/SessionTokenIssuer.js';
import { readSessionConfig } from './contexts/identity/infrastructure/config/SessionConfig.js';
import { readIdentityRateLimitConfig } from './contexts/identity/infrastructure/config/IdentityRateLimitConfig.js';
import { SessionPolicy } from './contexts/identity/domain/value-objects/SessionPolicy.js';
import { InMemoryIdentityProviderAdapter } from './contexts/identity/infrastructure/adapters/out/memory/InMemoryIdentityProviderAdapter.js';
import { InMemoryRateLimiter } from './contexts/identity/infrastructure/adapters/out/memory/InMemoryRateLimiter.js';
import { JoseTokenSigningAdapter } from './contexts/identity/infrastructure/adapters/out/jwt/JoseTokenSigningAdapter.js';
import { RandomSessionIdGenerator } from './contexts/identity/infrastructure/adapters/out/crypto/RandomSessionIdGenerator.js';
import { MongoRefreshTokenRepository } from './contexts/identity/infrastructure/adapters/out/mongo/MongoRefreshTokenRepository.js';
import { FanOutProfileSync } from './contexts/identity/infrastructure/adapters/out/profile-sync/FanOutProfileSync.js';
import { ConsentStatusAdapter } from './contexts/identity/infrastructure/adapters/out/consent-status/ConsentStatusAdapter.js';
import { createAuthRouter } from './contexts/identity/infrastructure/http/authRoutes.js';

import { SyncStudentProfileFromDirectory } from './contexts/profile/application/SyncStudentProfileFromDirectory.js';
import { readProfileConfig } from './contexts/profile/infrastructure/config/ProfileConfig.js';
import { MongoStudentProfileRepository } from './contexts/profile/infrastructure/adapters/out/mongo/MongoStudentProfileRepository.js';
import { IdentityProfileSyncAdapter } from './contexts/profile/infrastructure/integration/IdentityProfileSyncAdapter.js';

import { SyncForumAuthor } from './contexts/forum/application/SyncForumAuthor.js';
import { MongoForumAuthorRepository } from './contexts/forum/infrastructure/adapters/out/mongo/MongoForumAuthorRepository.js';
import { IdentityForumAuthorSyncAdapter } from './contexts/forum/infrastructure/integration/IdentityForumAuthorSyncAdapter.js';

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

  const clock = new SystemClock();
  const sessionConfig = readSessionConfig();
  const sessionPolicy = SessionPolicy.create(sessionConfig);

  const programCatalog = await loadProgramCatalog();
  const programCatalogMatcher = new ProgramCatalogMatcher(programCatalog);
  const profileConfig = readProfileConfig();

  const profileSync = new IdentityProfileSyncAdapter(
    new SyncStudentProfileFromDirectory({
      profiles: new MongoStudentProfileRepository(db, profileConfig.semesterBounds),
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

  const sessionTokenIssuer = new SessionTokenIssuer({
    signer: new JoseTokenSigningAdapter(sessionConfig, clock),
    refreshTokens: new MongoRefreshTokenRepository(db),
    clock,
    ids: new RandomSessionIdGenerator(),
    policy: sessionPolicy
  });

  // ATENCION: `InMemoryIdentityProviderAdapter` solo conoce la cuenta de
  // prueba que trae por defecto (estudiante@upb.edu.co / S3cr3t!UPB) mas las
  // que se registren aqui con `.register(...)`. Sustituirlo por
  // `RealIdentityProviderAdapter` (hoy un stub que siempre lanza) es el unico
  // cambio necesario para conectar el directorio institucional real —
  // mismo principio de "adaptador reemplazable sin tocar el caso de uso" que
  // ya documenta `main.ts` para el buzon IMAP.
  const identityProvider = new InMemoryIdentityProviderAdapter();

  const authenticateStudent = new AuthenticateStudent({
    provider: identityProvider,
    rateLimiter: new InMemoryRateLimiter(readIdentityRateLimitConfig()),
    sessions: sessionTokenIssuer,
    profileSync: new FanOutProfileSync([profileSync, forumAuthorSync]),
    consentStatus
  });

  const app = createHttpServer([createAuthRouter(authenticateStudent)]);
  const port = Number(process.env['PORT'] ?? process.env['HTTP_PORT'] ?? 3000);
  const server = app.listen(port, () => {
    console.log(`[http] escuchando en el puerto ${port}`);
  });

  process.on('SIGTERM', () => { server.close(); void client.close(); });
  process.on('SIGINT', () => { server.close(); void client.close(); });
}

bootstrap().catch((error) => {
  console.error('[http] no fue posible iniciar el servidor:', error);
  process.exit(1);
});
