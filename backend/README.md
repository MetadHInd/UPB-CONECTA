# UPB Conecta

Plataforma móvil centralizada de información académica para la UPB Seccional Bucaramanga: reúne en una sola aplicación las convocatorias con fecha de cierre y la oferta de prácticas que hoy se dispersan en el correo masivo institucional y en los canales de cada coordinación, clasificadas por programa académico, con notificaciones anticipadas, mapa del campus, foro con identidad verificada y moderación automática, y un chatbot de preguntas frecuentes.

Proyecto académico de **Proyecto Integrador III**, Ingeniería de Sistemas e Informática, Universidad Pontificia Bolivariana — Seccional Bucaramanga, 2026-20.

## El problema

El correo masivo institucional entrega toda la información con el mismo peso visual: boletines, avisos administrativos, eventos y convocatorias con fecha límite llegan juntos, sin jerarquía ni segmentación por programa. Un anuncio crítico —como la apertura de un curso requisito de grado— puede descubrirse cuando la inscripción ya cerró. La oferta de prácticas se dispersa entre correo, carteleras y anuncios de cada coordinación sin un listado único. Las aplicaciones institucionales existentes (UPB Digital, UPB Colombia) resuelven identificación digital y acceso físico, pero no priorización por fecha de cierre ni orientación espacial fuera de la sede de Medellín. Tampoco existe un espacio institucional de interacción horizontal entre estudiantes con identidad verificada.

UPB Conecta ataca específicamente ese vacío: agregación, segmentación y oportunidad — no la disponibilidad de la información, que ya existe, sino su organización.

## Equipo

| Rol | Integrante |
|---|---|
| Product Owner | Miguel José Vargas Martínez |
| Scrum Master | Johan Sebastián Almeida Rincón |
| Developer | Juan Eduardo Benítez Pájaro |

## Estado actual del código

Este proyecto (backend, subcarpeta `backend/` del repositorio) implementa, por ahora, quince historias entre el Sprint 1 y el Sprint 2: **HU-01 (SCRUM-13)** — conexión programada e idempotente al buzón institucional recolector, el primer eslabón del pipeline de ingesta (EP-01), base de todo lo demás: sin ingesta no hay clasificación, sin clasificación no hay feed, sin feed no hay notificaciones — junto con **HU-02** (extracción de metadatos y normalización del cuerpo), **HU-03** (deduplicación por contenido en ventana temporal), **HU-04** (cuarentena de mensajes no procesables y bitácora, criterios 1-4), **HU-05** (resiliencia del buzón), **HU-08** (extracción de fecha de cierre y enlace de postulación), **HU-15** (vista de detalle de la convocatoria, criterios 1-4), **HU-16** (marcado de estado personal, criterios 1/2/3/5), **HU-18** (registro y ciclo de vida de dispositivos, criterios 1-5), **HU-21** (agrupación de avisos y límite diario, criterios 1/2/3/6), **HU-38** (preferencias de notificación, criterios 1/2/3/5/6), **HU-44** (consentimiento informado), **HU-51** (tablero de métricas de operación y calidad del clasificador, criterios 1-6), **HU-53** (verificación automatizada de la arquitectura) y **HU-55** (rendimiento y resiliencia, criterios 3-4 parciales).

> Nota: esta sección no lista todavía cada historia implementada en el repositorio (por ejemplo HU-06 a HU-12, HU-30, HU-37, HU-43, HU-45-HU-47, HU-49-HU-50, ya en `main` — ver el listado completo y actualizado en el [README raíz](../README.md#estado-actual)); se mantiene aquí en su redacción original de Sprint 1-2 y solo se le agregó esta historia.

El resto del backlog (12 épicas, 57 historias de usuario, ver la Especificación de Requerimientos y el Product Backlog del proyecto) vive en Jira. Los sprints activos agrupan, además de estas catorce, las historias que comparten su mismo riesgo técnico — ingesta, deduplicación, clasificación temprana y arquitectura verificable:

| Historia | Qué cubre |
|---|---|
| HU-01 *(implementada aquí)* | Conexión programada e idempotente al buzón institucional |
| HU-02 *(implementada aquí)* | Extracción de metadatos y normalización del cuerpo del mensaje |
| HU-03 *(implementada aquí)* | Deduplicación por contenido dentro de ventana temporal configurable |
| HU-04 *(implementada aquí, criterios 1-4)* | Cuarentena de mensajes no procesables y bitácora de ingesta |
| HU-05 *(implementada aquí)* | Reintento con espera exponencial y circuit breaker ante indisponibilidad del buzón |
| HU-08 *(implementada aquí)* | Extracción de fecha de cierre y enlace de postulación |
| HU-15 *(implementada aquí, criterios 1-4)* | Vista de detalle de la convocatoria con acceso al canal de postulación |
| HU-16 *(implementada aquí, criterios 1/2/3/5)* | Marcado de estado personal y sección separada de eventos de interés general |
| HU-18 *(implementada aquí, criterios 1-5)* | Registro y ciclo de vida del dispositivo para entrega de notificaciones |
| HU-21 *(implementada aquí, criterios 1/2/3/6)* | Agrupación de avisos, límite diario y apertura directa al detalle |
| HU-38 *(implementada aquí, criterios 1/2/3/5/6)* | Preferencias de notificación por categoría, anticipación y tema visual |
| HU-44 *(implementada aquí)* | Consentimiento informado de tratamiento de datos con registro versionado |
| HU-51 *(implementada aquí, criterios 1-6)* | Tablero de métricas de operación y calidad del clasificador |
| HU-53 *(implementada aquí)* | Aislamiento del dominio verificable y sustituibilidad de los adaptadores |
| HU-54 | Cobertura de pruebas bajo TDD y dobles para escenarios de falla externa |
| HU-55 *(implementada aquí, criterios 3-4)* | Rendimiento bajo carga (parcial) y degradación controlada ante fallos |
| T-01 | Desbloqueo de las dependencias institucionales externas (buzón y directorio) |
| T-02 | Modelo de datos documental, repositorios e índices base |

`src/contexts/consent/`, `src/contexts/notifications/`, `src/contexts/personalization/` y `src/contexts/metrics/` (HU-51, tablero de métricas de operación) son algunos de los contextos fuera de `ingestion` — mismo patrón hexagonal, ver el README propio de cada uno; el árbol completo de contextos hoy incluye además `classification`, `identity`, `consent`, `forum`, `targeting`, `hardening`, `moderation`, `feed` y `profile`, cada uno con su propio README.

## Arquitectura

**Hexagonal (puertos y adaptadores, Cockburn).** No es una preferencia de estilo: el buzón institucional, el futuro servicio de clasificación y el proveedor de notificaciones push son dependencias externas fuera del control del equipo, con contratos que pueden cambiar sin aviso. La arquitectura hexagonal obliga a que esas fuentes entren al sistema como adaptadores reemplazables detrás de un puerto, de modo que el dominio se pueda desarrollar y probar de forma aislada — y que sustituir, por ejemplo, el `InMemoryMailboxAdapter` simulado por el `ImapMailboxAdapter` real (cuando la Universidad habilite el buzón) sea un cambio de una línea en la raíz de composición, sin tocar dominio ni casos de uso.

```
src/contexts/ingestion/
  domain/          value objects, entidades, políticas y puertos (in/out). No importa infraestructura.
  application/     el caso de uso. Orquesta puertos, no conoce IMAP ni MongoDB.
  infrastructure/  configuración, planificador, normalización MIME (HU-02), extracción de fecha/enlace (HU-08) y adaptadores: mongo/, imap/, memory/, resilience/ (retry + circuit breaker), normalization/ (puerto de HU-03).
src/contexts/consent/
  domain/          ConsentRecord, ConsentPolicy, puertos (in/out).
  application/     RecordConsent, GetConsentStatus.
  infrastructure/  adaptadores en memoria y MongoDB (append-only), reloj.
src/contexts/notifications/
  domain/          DeviceRegistration, NotificationPreferences, puertos (in/out).
  application/     RegisterDevice, InvalidateDevice, ListActiveDevices, UpdateNotificationPreferences, GetNotificationPreferences.
  infrastructure/  adaptadores en memoria y MongoDB, reloj.
src/contexts/personalization/
  domain/          ConvocatoriaPersonalState, puertos (in/out).
  application/     UpdatePersonalState, GetPersonalState, ListSavedConvocatorias, ListArchivedConvocatorias.
  infrastructure/  adaptadores en memoria y MongoDB, reloj.
src/main.ts        raíz de composición del scheduler de ingesta: único lugar donde se eligen los adaptadores concretos de ese contexto.
```

La regla de dependencia (RNF-41: el dominio no importa framework, persistencia ni cliente externo) no es solo una convención — `scripts/check-architecture.mjs` la verifica por análisis estático y rompe el pipeline si alguien la viola.

## Stack técnico

- **TypeScript** estricto sobre Node.js (ES modules).
- **MongoDB** como motor documental — decisión deliberada, no relacional: los mensajes institucionales son heterogéneos (unos declaran fecha de cierre, otros no; unos identifican programa destinatario, otros se dirigen a toda la comunidad), y forzar esa variabilidad en un esquema relacional fijo produciría una tabla con mayoría de columnas vacías y una migración por cada tipo nuevo de convocatoria.
- **Vitest** para pruebas, con dos estrategias distintas según la capa (ver más abajo).

## Cómo levantar el entorno

### 1. MongoDB real en local

El proyecto usa MongoDB de verdad para correr — tanto en ejecución normal como en las pruebas de los adaptadores — no una base simulada:

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

Queda escuchando en `mongodb://localhost:27017`, sin autenticación (uso local de desarrollo). Verificar que responde:

```bash
mongosh --eval "db.runCommand({ping:1})"
```

### 2. Variables de entorno

```bash
cp .env.example .env
```

`INGESTION_INTERVAL_MS` y `INGESTION_BATCH_SIZE` controlan el planificador (RF-01, criterio 2: la frecuencia es parametrizable sin recompilar). `MAILBOX_*` son las credenciales del buzón IMAP real (todavía no habilitado por la Universidad — ver la nota en el README del contexto de ingesta). `MONGODB_URI` y `MONGODB_DATABASE` apuntan a la instancia local.

### 3. Instalar y correr

```bash
npm install
npm run typecheck            # TypeScript estricto
npm run check:architecture   # RNF-41: el dominio no puede importar infraestructura
npm run check:authorization  # HU-46: toda operacion administrativa declara su rol requerido
npm test                     # 702 pruebas (requiere MongoDB corriendo)
npm run test:coverage        # umbral del 80% sobre dominio y casos de uso
npm run build                # compila a dist/
```

Si MongoDB no está disponible, `npm test` falla de entrada con un mensaje explícito (`tests/setup/ensureMongoAvailable.ts`) en lugar de colgarse o fallar de forma críptica en cada archivo.

## Estrategia de pruebas: por qué hay dos tipos

- **Dominio, aplicación y planificador** (`tests/domain/`, `tests/application/`, la parte del scheduler/config en `tests/infrastructure/`): dobles en memoria escritos a mano, sin red ni base de datos. Es lo que permite probar el caso de uso completo mientras la Universidad habilita el buzón real, y es rápido porque no depende de infraestructura.
- **Los tres adaptadores de MongoDB** (`tests/infrastructure/mongo/*.integration.test.ts`): corren contra la instancia real de MongoDB descrita arriba, no contra un mock del driver. Un mock le devolvería al test lo que el test le pida sin validar que el filtro por `_id`, el `upsert` con `$setOnInsert` o el índice declarado en `ensureIndexes` funcionan de verdad contra el motor real — que es exactamente el tipo de fallo silencioso que un adaptador puede introducir.

Esta separación es deliberada y es el punto central de la arquitectura hexagonal: el dominio se prueba sin infraestructura, la infraestructura se prueba contra infraestructura real.

## CI/CD

`.github/workflows/ci.yml` corre en cada push y cada pull request contra `main`: typecheck, regla de arquitectura, la suite completa de pruebas (con MongoDB real como *service container*) y `npm audit` sobre dependencias de producción. La rama `main` está protegida: un pull request no se puede fusionar si ese workflow no queda en verde, ni siquiera para el dueño del repositorio.

## Seguridad

- Ninguna credencial vive en el repositorio: `.env` está en `.gitignore`, `.env.example` solo tiene placeholders.
- Las consultas a MongoDB usan filtros tipados del driver, nunca concatenación de strings — sin superficie de inyección.
- La garantía de idempotencia (RF-02) vive en el dominio (`IdempotencyPolicy`), no depende únicamente de una restricción de base de datos como defensa.
- El adaptador IMAP nunca registra credenciales en logs.
- `npm audit` sin vulnerabilidades pendientes en dependencias de producción (verificado en CI en cada cambio).

## Trazabilidad

Todo el código enlaza de vuelta a la Especificación de Requerimientos: los identificadores `RF-XX` / `RNF-XX` en los comentarios de dominio remiten a los requerimientos funcionales/no funcionales, `HU-XX` a la historia de usuario en Jira, y `CU-XX` al caso de uso formal. El detalle específico de HU-01 —criterios de aceptación uno por uno y qué prueba cubre cada uno— está en [`src/contexts/ingestion/README.md`](src/contexts/ingestion/README.md).
