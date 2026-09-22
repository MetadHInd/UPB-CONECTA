# Contexto de identidad

## Propósito

Este contexto atiende la HU-43 (autenticación de estudiantes contra el directorio institucional) y la HU-45 (expiración de sesión y rotación de refresh token). Ver la sección [HU-45](#hu-45--expiración-de-sesión-y-rotación-de-refresh-token).

La política del backend es explícita:

- no se guarda la contraseña del estudiante en ningún repositorio local;
- no se crea una integración "real" falsa con directorio institucional;
- se expone una capa de puertos para adaptar LDAP, OAuth o un proveedor institucional real cuando exista la infraestructura externa;
- la autenticación debe devolver mensajes genéricos para evitar filtrar si el usuario o la contraseña son incorrectos;
- se aplica rate limiting para evitar fuerza bruta.

## Puertos y adaptadores

### Dominio

- `IdentityProviderPort`: contrato del proveedor de autenticación.
- `RateLimiterPort`: contrato para controlar intentos fallidos repetidos.
- `AuthenticationResult`: resultado de la autenticación con estados `ok: true` o `ok: false`.

### Aplicación

- `AuthenticateStudent`: caso de uso principal para validar credenciales y devolver un resultado seguro al cliente.

### Infraestructura

- `InMemoryIdentityProviderAdapter`: adaptación local para pruebas y entorno sin proveedor externo real.
- `RealIdentityProviderAdapter`: adaptador que falla explícitamente hasta que exista configuración real del directorio institucional.
- `InMemoryRateLimiter`: limitador en memoria con ventana configurable por variables de entorno.

## Variables de entorno soportadas

- `IDENTITY_RATE_LIMIT_WINDOW_MS`: duración de la ventana para contar fallidos.
- `IDENTITY_RATE_LIMIT_MAX_PER_ACCOUNT`: máximo de intentos fallidos por cuenta.
- `IDENTITY_RATE_LIMIT_MAX_PER_ORIGIN`: máximo de intentos fallidos por origen.

Valores por defecto:

- `windowMs`: 60000 ms
- `maxAttemptsPerAccount`: 5
- `maxAttemptsPerOrigin`: 10

## Reglas de seguridad

1. La contraseña nunca se persiste en claro.
2. Si el directorio institucional no está disponible, el cliente recibe un mensaje genérico de indisponibilidad.
3. Si las credenciales son inválidas, el cliente recibe únicamente: "Credenciales inválidas."
4. Si el usuario supera el número de intentos, se devuelve un error de rate limit.
5. El almacenamiento de tokens/certificados sensibles en el dispositivo queda fuera del backend y corresponde al lado de Android con Keystore. El backend emite y verifica los tokens de sesión (HU-45), pero nunca persiste el token firmado: solo su identificador (`jti`).

## Riesgo de integración

La integración con el directorio real no se implementa como un 'stub realista' ni se oculta bajo mocks. Se declara como un adaptador que falla con un error explícito hasta que haya un proveedor institucional real y configurado.

## HU-45 — Expiración de sesión y rotación de refresh token

Trazabilidad: RF-72, RF-64, RNF-17.

### Alcance

- Al autenticarse (HU-43), el estudiante recibe un par **access + refresh**. El access token es corto; el refresh token permite renovarlo sin volver a pedir credenciales.
- Cada renovación **rota** el refresh token: el usado queda `used` y se emite otro en la misma cadena (familia de rotación, `sessionId`).
- Si llega un refresh token ya `used`, se asume que alguien tiene una copia: se **revoca la cadena completa** y se obliga a autenticarse de nuevo.
- El cierre de sesión revoca la cadena del refresh token presentado.
- Todo token manipulado, malformado o de un tipo equivocado se rechaza y queda registrado en la auditoría de seguridad.

**No hay servidor HTTP en este repositorio, y eso no bloquea la historia.** El diseño asigna la validación de firma y vigencia al adaptador de entrada HTTP, nunca al dominio. Aquí se entrega todo lo que esa capa consumirá:

- `VerifyAccessToken`: lo que un middleware futuro llamará en cada petición autenticada (`Authorization: Bearer ...`).
- `RefreshSession`: lo que llamará un futuro `POST /session/refresh`.
- `LogoutSession`: lo que llamará un futuro `POST /session/logout`.

La criptografía vive en `JoseTokenSigningAdapter` (infraestructura), detrás de `TokenSigningPort`. Dominio y aplicación no importan `jose` ni `node:crypto`, y `npm run check:architecture` lo hace cumplir. Cuando exista la capa HTTP, solo tendrá que traducir encabezados y códigos de estado; no debe reimplementar ninguna regla de sesión.

### Librería JWT elegida: `jose`

Se agregó `jose` (dependencia de producción) en lugar de `jsonwebtoken` o de implementar HS256 a mano con `node:crypto`:

- **Cero dependencias transitivas** y tipos TypeScript incluidos (sin `@types/*`).
- **ESM nativo**, igual que este paquete (`"type": "module"`).
- **Lista cerrada de algoritmos** (`algorithms: ['HS256']`): rechaza `alg: none` y la confusión de algoritmos. Hay una prueba específica.
- **`currentDate` en la verificación**: la vigencia se evalúa con el `ClockPort` inyectado, así que la expiración (criterio 1) se prueba moviendo un reloj manual, sin esperas reales ni `vi.useFakeTimers`.
- **Errores tipados** (`JWTExpired`, `JWSSignatureVerificationFailed`, ...): el adaptador distingue "expirado" (normal, no se audita) de "firma inválida" (ataque, se audita). Además `jose` comprueba la firma antes que los claims, así que un token vencido y manipulado se reporta como firma inválida.
- Implementar JWT a mano con `node:crypto` obligaría a mantener código propio de parseo, comparación en tiempo constante y validación de claims; es justo el tipo de código que no conviene escribir en un proyecto académico.

Firma: HS256 con un secreto compartido (`SESSION_SIGNING_SECRET`). Es suficiente mientras el mismo backend emite y verifica. Si en el futuro otro servicio necesita verificar sin poder firmar, se cambia a ES256/EdDSA dentro del adaptador sin tocar el puerto.

### Puertos y adaptadores (HU-45)

| Capa | Pieza | Rol |
|---|---|---|
| Dominio | `SessionPolicy` | Vigencia de access y refresh; exige que el access expire antes que el refresh. |
| Dominio | `AccessToken`, `RefreshToken`, `SessionTokens` | Tokens emitidos (valor opaco + `expiresAt`) y `sessionId` de la cadena. |
| Dominio | `RefreshTokenRecord` | Estado persistido de cada refresh token: `active` → `used` → (`revoked`). |
| Dominio | `SessionResult` | Resultados de renovación, verificación y logout, con `requiresReauthentication`. |
| Puerto | `TokenSigningPort` | `sign(claims)` / `verify(token, kind)`; `verify` nunca lanza y nunca devuelve claims sin verificar. |
| Puerto | `RefreshTokenRepositoryPort` | `register`, `findByTokenId`, `markUsed` atómico, `revokeChain`, `isChainRevoked`. |
| Puerto | `SecurityAuditLogPort` | Registro mínimo de intentos rechazados y de reusos. |
| Puerto | `ClockPort`, `SessionIdGeneratorPort` | Tiempo y aleatoriedad fuera del dominio. |
| Aplicación | `SessionTokenIssuer` | Emite el par y registra el refresh token en la cadena. |
| Aplicación | `RefreshSession`, `VerifyAccessToken`, `LogoutSession` | Casos de uso que consumirá la capa HTTP. |
| Infraestructura | `JoseTokenSigningAdapter` | JWT HS256 con `jose`. |
| Infraestructura | `MongoRefreshTokenRepository` / `InMemoryRefreshTokenRepository` | Cadena de rotación. |
| Infraestructura | `InMemorySecurityAuditLog` | Doble de auditoría. |
| Infraestructura | `RandomSessionIdGenerator`, `SystemClock`, `ManualClock` | `randomUUID()` y relojes. |
| Infraestructura | `SessionConfig` | Lectura del entorno. |

### Decisiones

1. **`AuthenticationResult` se extiende, no se duplica.** El caso `ok: true` gana el campo `session: SessionTokens`; el resto de la forma no cambia. Antes de cambiarlo se verificó que solo lo consumen `AuthenticateStudent`, los adaptadores de identidad y `tests/identity/IdentityAuthFlow.test.ts`. `AuthenticateStudent` recibe una dependencia nueva obligatoria, `sessions: SessionTokenIssuer`. Se hizo obligatoria a propósito: con una dependencia opcional, un cableado incompleto produciría logins "correctos" sin tokens. Las pruebas de HU-43 se actualizaron para inyectarla.
2. **Un fallo al emitir tokens no cuenta como credencial inválida.** La llamada al proveedor quedó sola dentro del `try`. Si el repositorio de tokens falla después de validar las credenciales, el error se propaga y no se suma un intento fallido al rate limiter.
3. **Sujeto del token = correo institucional.** `IdentityProfile.studentId` es opcional; el correo siempre llega.
4. **El refresh token también es un JWT firmado**, no un valor opaco. Así la manipulación se detecta en el adaptador para ambos tipos (criterio 6), y el repositorio solo guarda el `jti`, nunca el token.
5. **`token_use` separa acceso de refresco.** Un refresh token no sirve como access token ni al revés (`WRONG_KIND`, auditado).
6. **Revocación a nivel de cadena, no solo por token.** `revokeChain` deja una marca de cadena (`identity_revoked_sessions`, `_id = chainId`) además de pasar a `revoked` cada token. Sin la marca hay una carrera: dos renovaciones simultáneas con el mismo token; la perdedora detecta reuso y revoca la cadena, pero la ganadora registra su token nuevo *después*. Ese token tardío quedaría `active` en una cadena revocada. Con la marca, `RefreshSession` lo rechaza.
7. **`markUsed` es atómico** (`updateOne` filtrando `status: 'active'`). De dos renovaciones concurrentes con el mismo token, solo una gana; la otra se trata como reuso y revoca la cadena. Esto es deliberadamente estricto: un cliente que reintenta una renovación tras un timeout de red perderá la sesión. Si eso resulta molesto en campo, la mitigación habitual es un periodo de gracia corto para el token recién rotado; no se implementó porque abre la ventana que el criterio 4 busca cerrar.
8. **El logout y el reuso cortan también el access token vigente.** `VerifyAccessToken` consulta `isChainRevoked`. Cuesta una lectura indexada por `_id` en cada petición, a cambio de que "cerrar sesión" (RF-64) y "se detectó un robo" tengan efecto inmediato y no esperen a que venza el access token.
9. **Auditoría: puerto propio, no extensión de `RateLimiterPort`.** El rate limiter es un contador síncrono en memoria que decide si se permite un intento. La auditoría es un registro append-only de eventos. Mezclarlos obligaría a cada limitador a saber de auditoría. Solo existe el doble en memoria, **que no es apto para producción** (ver [Pendientes antes de producción](#pendientes-antes-de-producción)). El evento **nunca incluye el token presentado**, porque un token, aunque sea manipulado, es material de credencial.
10. **Qué se audita.** Firma inválida, token malformado, tipo equivocado y reuso sí. Un token simplemente expirado no, porque es el flujo normal (el cliente renueva).
11. **Renovación deslizante.** Cada rotación emite un refresh token con vigencia completa. Mientras el estudiante abra la app dentro de `SESSION_REFRESH_TOKEN_TTL_SECONDS` no vuelve a pedir credenciales. No hay tope absoluto de vida de la cadena (ver [Pendientes antes de producción](#pendientes-antes-de-producción)).
12. **Índice TTL en `expiresAt`.** Mongo purga los registros de refresh tokens vencidos. Esto no debilita la detección de reuso: un token vencido ya no pasa la verificación de firma.
13. **Sin rotación de claves de firma (`kid`).** Cambiar `SESSION_SIGNING_SECRET` invalida todas las sesiones (ver [Pendientes antes de producción](#pendientes-antes-de-producción)).

### Pendientes antes de producción

HU-45 cumple sus seis criterios, pero estos tres huecos quedan abiertos de forma deliberada. Ninguno se resuelve con configuración: cada uno exige código nuevo antes de desplegar en producción.

1. **La auditoría de seguridad solo existe en memoria. No es apta para producción.** `InMemorySecurityAuditLog` es el único adaptador de `SecurityAuditLogPort`. Los eventos de firma inválida y de reuso (criterio 6 y criterio 4) se pierden al reiniciar el proceso, no se comparten entre instancias y nadie los puede consultar ni alertar sobre ellos. En producción el criterio 6 ("el intento queda registrado") **no se cumple** con este adaptador. Antes de desplegar hay que implementar un adaptador persistente (colección Mongo append-only, log estructurado hacia el agregador de logs o SIEM) y cablearlo en lugar del doble. Las pruebas actuales verifican el contrato del puerto, no la persistencia.
2. **Sin rotación de la clave de firma.** Hay un solo `SESSION_SIGNING_SECRET` y ningún `kid` en el encabezado. Rotar el secreto (por ejemplo, ante una filtración) invalida de golpe todas las sesiones activas; no existe un periodo en que convivan la clave vieja y la nueva.
3. **Sin tope absoluto de vida de la cadena.** La renovación es deslizante: un estudiante que abra la app al menos una vez dentro de `SESSION_REFRESH_TOKEN_TTL_SECONDS` mantiene la misma cadena indefinidamente, sin volver a presentar credenciales. Si se exige reautenticación periódica, hay que agregar una vigencia máxima de cadena a `SessionPolicy` y guardar el inicio de la cadena en `RefreshTokenRecord`.

### Variables de entorno (HU-45)

| Variable | Por defecto | Descripción |
|---|---|---|
| `SESSION_SIGNING_SECRET` | *(obligatoria, ≥ 32 caracteres)* | Secreto HS256. Sin él, el arranque falla. |
| `SESSION_ACCESS_TOKEN_TTL_SECONDS` | `900` (15 min) | Vigencia del access token. |
| `SESSION_REFRESH_TOKEN_TTL_SECONDS` | `2592000` (30 días) | Vigencia de cada refresh token. Debe ser mayor que la del access. |
| `SESSION_TOKEN_ISSUER` | `upb-conecta` | Claim `iss`. |
| `SESSION_TOKEN_AUDIENCE` | `upb-conecta-app` | Claim `aud`. |

`readSessionConfig` valida todo al arrancar (enteros positivos, access < refresh, longitud del secreto), no en el primer login.

### Colecciones MongoDB

- `identity_refresh_tokens`: `_id = jti`, `chainId`, `subject`, `status`, `issuedAt`, `expiresAt`, `usedAt`, `revokedAt`, `revokedReason`. Índices: `idx_chain_status` `{ chainId: 1, status: 1 }` y `ttl_expires_at` `{ expiresAt: 1 }` con `expireAfterSeconds: 0`. Se crean con `MongoRefreshTokenRepository.ensureIndexes(db)`.
- `identity_revoked_sessions`: `_id = chainId`, `reason`, `revokedAt`. Upsert con `$setOnInsert`, así que se conserva el primer motivo.

### Criterios de aceptación y pruebas

| # | Criterio | Pruebas |
|---|---|---|
| 1 | El access token expira tras el periodo configurado y deja de aceptarse | `SessionLifecycle.test.ts` › criterio 1 (acepta en `ttl-1s`, rechaza en `ttl`; refresh expirado no renueva); `JoseTokenSigningAdapter.test.ts` › vigencia con reloj inyectado |
| 2 | Con acceso expirado y refresh vigente se renueva sin credenciales | `SessionLifecycle.test.ts` › criterio 2 (renovación en la misma sesión, rotación a `used`, tipos cruzados rechazados, refresh desconocido rechazado) |
| 3 | El logout invalida el refresh token | `SessionLifecycle.test.ts` › criterio 3 (no renueva tras logout, corta el access, motivo `logout` persistido, no afecta otra sesión, idempotente, logout con token manipulado rechazado) |
| 4 | Reuso de un refresh token usado invalida la cadena completa y obliga a reautenticarse | `SessionLifecycle.test.ts` › criterio 4 (**cadena de 3 rotaciones con reuso de R2 a mitad de cadena**: R4 vigente y R1 también quedan inválidos, el access de R4 se rechaza, los 4 registros quedan `revoked/reuse-detected`; auditoría del reuso; un login nuevo abre una cadena independiente; carrera concurrente); `MongoRefreshTokenRepository.integration.test.ts` › mismo flujo contra Mongo real |
| 5 | La expiración es configurable sin recompilar | `SessionConfig.test.ts` (lectura del entorno, valores por defecto, mismo código con dos vigencias distintas, validaciones) |
| 6 | Token manipulado o con firma inválida se rechaza y se registra | `SessionLifecycle.test.ts` › criterio 6 (payload alterado, `exp` extendido, otro secreto, basura; el log no contiene el token); `JoseTokenSigningAdapter.test.ts` (`alg: none`, otra audiencia, claims faltantes, tipo equivocado) |

Repositorio Mongo: `tests/infrastructure/mongo/MongoRefreshTokenRepository.integration.test.ts` corre contra una instancia real (índices, `markUsed` atómico con dos llamadas concurrentes, `revokeChain` limitado a su cadena, idempotencia del motivo).
