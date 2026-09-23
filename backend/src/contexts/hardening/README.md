# Contexto de hardening

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de la historia **HU-47: hardening del transporte, validación de entradas y limitación de tasa** (RNF-13, RNF-15, RNF-16; Entregable 3 del Project Charter: Política de Seguridad).

## Por qué un contexto nuevo

HU-47 no pertenece a un dominio de negocio (ingesta, clasificación, foro, ...): es una historia de verificación transversal, igual que HU-53 (verificación de arquitectura, documentada dentro de `ingestion` por no tener mejor sitio) o HU-46 (control de acceso, dentro de `identity`). A diferencia de HU-46 — que sí encaja en `identity` porque gira en torno a la cuenta autenticada —, HU-47 no tiene relación con la identidad del estudiante: es sobre la forma de la entrada, la tasa de peticiones y el transporte. Se le da su propio contexto en vez de forzarlo dentro de `identity` o `forum`, con el mismo criterio que llevó a crear `targeting` en vez de meterlo en `classification` (RNF-41: la separación de contextos por regla de dominio propia, no solo por conveniencia).

## Alcance real: qué existe hoy y qué no

**No hay servidor HTTP en este repositorio, y eso no bloquea la historia** — mismo patrón que HU-09, HU-30, HU-45 y HU-46. Cada pieza aquí es el punto de enganche que un adaptador de entrada futuro consumirá; ninguna pieza reimplementará su propia regla cuando ese adaptador exista.

### Criterios 1 y 2 — TLS y certificate pinning: diferidos, fuera del backend

No hay servidor HTTP que configurar con una versión mínima de TLS, y el certificate pinning es configuración del **cliente Android** (`Frontend/`), no de este repositorio. Mismo bloqueante que HU-04 criterio 5, HU-44 criterios 1 y 3, y HU-55: necesitan una capa HTTP que no existe todavía. No se inventó un servidor HTTP para poder marcar estos dos criterios como cubiertos.

**Definición de terminado** ("documento de Política de Seguridad actualizado con el procedimiento de rotación del certificado"): es un entregable de planeación, no de código — vive fuera de este repositorio de backend (ver `DocumentosUPBConecta/` en la raíz del proyecto). No se creó un documento nuevo sin que el equipo lo pidiera; queda como tarea explícitamente pendiente de documentación, no de código.

### Criterios 3 y 4 — Validación de esquema en el borde

`domain/services/SchemaValidation.ts` (`validateAgainstSchema`): esquema declarativo mínimo (`{ field, type, required?, maxLength?, pattern? }`) para validar la forma de una entrada externa antes de que llegue al dominio — "el dominio nunca recibe datos no validados y puede asumir invariantes" (diseño de la historia en Jira). Deliberadamente pequeño: no reemplaza una librería de validación completa (zod, ajv); si en el futuro hace falta algo más expresivo (objetos anidados, arreglos), conviene adoptar una en vez de seguir creciendo esto a mano.

**`PublicSafeValidationError`** (criterio 4): el único tipo de error que este mecanismo produce. Un adaptador de entrada futuro puede devolver `.message` tal cual al cliente sin filtrar nunca un stack trace, un nombre de clase interno o el mensaje crudo de un driver.

**Esto ya está probado en producción, no solo en aislamiento**: `CreatePost` (HU-30, `forum`) ya seguía exactamente esta misma disciplina de forma independiente, antes de que existiera este contexto (`classifyPostBody` + `validatePostContent` + `PostRejectionKind`, con mensajes redactados a mano, sin fugas). No se reescribió ese código para usar `validateAgainstSchema` — sería una migración sin beneficio real sobre código ya probado. En su lugar, `tests/forum/CreatePostSecurity.test.ts` (criterio 4) verifica explícitamente, contra el caso de uso real, que un rechazo por contenido inválido nunca incluye detalles internos.

### Criterios 5 y 6 — Limitación de tasa

`RateLimiterPort` (genérico: `consume(operation, subject, policy)`) es **distinto** de `identity.RateLimiterPort` (HU-43): aquel es específico para bloqueo de fuerza bruta en login (`checkAllowed`/`recordFailure`/`recordSuccess` sobre cuenta+origen); este es un limitador de tasa general por operación+sujeto, para cualquier punto de entrada.

- **Catálogo de políticas** (`config/rate-limit-policies.json`, mismo patrón que `config/protected-operations.json` de HU-46): `{ operation, limit, windowMs }`. Editar el límite de una operación es editar el JSON, no recompilar.
- **`InMemorySlidingWindowRateLimiter`**: ventana deslizante, solo en memoria — mismo alcance que `InMemoryRateLimiter` de `identity`: un limitador de tasa asume un solo proceso, y no existe (ni lo pide esta historia) una necesidad de compartir el conteo entre instancias del backend.
- **`EnforceRateLimit`** (aplicación): resuelve la política, consulta el limitador, y si se excede, audita el evento (`RateLimitAuditLogPort`, append-only, mismo patrón que `MongoAuthorizationAuditLog`) y devuelve `{ allowed: false, retryAfterMs }`. Una operación sin política declarada **falla explícitamente** (`UnknownRateLimitedOperationError`) en vez de tratarse como "sin límite" — mismo criterio que `UnknownProtectedOperationError` de HU-46: el catálogo es la única fuente de verdad. El código HTTP 429 del criterio 6 es responsabilidad del futuro adaptador; este caso de uso solo expone la decisión.

**Hoy el catálogo declara una sola operación**: `CreatePost` (forum) → 5 publicaciones por minuto (límite de partida documentado, no calibrado — mismo espíritu que `ReviewThreshold.default() = 0.6` de HU-10: el valor correcto lo ajustará un administrador con datos reales de uso).

**"El adaptador de ingesta" (parte del criterio 5), evaluado y descartado explícitamente**: la ingesta (HU-01) es un proceso programado que *lee* un buzón institucional en ciclos, no un punto de entrada que *recibe* peticiones externas de usuarios — no hay "un usuario" cuya tasa limitar, ni una petición entrante que rechazar. Aplicarle un limitador de tasa no tiene contraparte real en el diseño actual del pipeline; forzarlo sería inventar un concepto sin sentido, contrario al estándar de honestidad que el resto de este proyecto exige en sus secciones "Diferido". Si en el futuro la ingesta se convierte en un webhook o en un endpoint que un proveedor de correo invoca, ahí sí aplicaría este mismo mecanismo.

### Criterio 7 — Neutralizar contenido malicioso

**Inyección en consultas (NoSQL)**: no hay nada que corregir en el código de este repositorio. Ningún adaptador de infraestructura construye un filtro de MongoDB a partir de JSON sin tipar que llegue de un cliente — todos reciben parámetros ya tipados (`string`, `Date`, etc.) que el driver oficial serializa siempre como valor literal, nunca como operador de consulta. `tests/infrastructure/mongo/NoSqlInjectionSafety.integration.test.ts` verifica esta garantía contra MongoDB real (no la asume): si algún cambio futuro empezara a construir filtros desde datos externos sin tipar, esa prueba sería la primera en romperse.

**Scripts en texto de foro (XSS almacenado)**: `domain/services/HtmlEncoding.ts` (`neutralizeHtml`) codifica `&`, `<`, `>`, `"`, `'` antes de persistir. Se evaluaron tres opciones:

- Eliminar etiquetas (`<script>...</script>` → `''`): puede dejar texto ilegible o con significado distinto al que escribió el estudiante.
- Rechazar la publicación completa (tratar `<` como carácter prohibido): hostil con texto legítimo que use `<`/`>` como puntuación (por ejemplo, "2 < 3 créditos").
- **Codificar (la implementada)**: preserva el texto visible tal cual lo escribió el autor, y garantiza que si algún cliente llegara a renderizar este texto como HTML (hoy Jetpack Compose no lo hace: pinta texto plano, no HTML — ver `Frontend/README.md`), el marcado nunca se interpreta como ejecutable.

**Conectado a `CreatePost.execute()`** (`forum/application/CreatePost.ts`): `title` y `text` se neutralizan justo antes de construir el registro a persistir, después de pasar `validatePostContent`. Edición mínima y dirigida sobre código ya fusionado (HU-30): un `import` más dos llamadas envolviendo los dos campos de texto ya validados, sin tocar ninguna otra regla de `CreatePost`. Verificado contra fixtures existentes de `ForumUseCases.test.ts` (ninguna usa `&`, `<`, `>`, `"` ni `'`, así que no cambia ningún resultado ya probado) y contra un caso nuevo en `tests/forum/CreatePostSecurity.test.ts`.

## Estructura

    src/contexts/hardening/
      domain/
        errors/           PublicSafeValidationError.
        services/         SchemaValidation (validateAgainstSchema), HtmlEncoding (neutralizeHtml).
        value-objects/     RateLimitPolicy (catálogo + policyFor).
        ports/out/         ClockPort, RateLimiterPort, RateLimitAuditLogPort.
      application/         EnforceRateLimit.
      infrastructure/
        adapters/out/memory/  InMemorySlidingWindowRateLimiter, InMemoryRateLimitAuditLog.
        adapters/out/mongo/   MongoRateLimitAuditLog (append-only, `hardening_rate_limit_audit`).
        config/               JsonRateLimitPolicyCatalog (lee `config/rate-limit-policies.json`).

No está conectado a `src/main.ts` (raíz de composición del scheduler de *ingesta*): este contexto, como `notifications`, `forum` e `identity`, no tiene todavía un proceso ni una capa HTTP propia desde la cual un adaptador de entrada lo invoque.

## Criterios de aceptación y pruebas

| Criterio | Descripción | Estado | Prueba correspondiente |
|---|---|---|---|
| 1 | TLS 1.2+ en todo el transporte | Diferido | Necesita servidor HTTP, que no existe todavía |
| 2 | Certificate pinning rechaza un certificado no fijado | Diferido | Configuración del cliente Android, fuera de este backend |
| 3 | Todo punto de entrada valida esquema antes de procesar | Cubierto (mecanismo genérico + demostrado en `CreatePost`) | `tests/hardening/SchemaValidation.test.ts`, `tests/forum/CreatePostSecurity.test.ts` |
| 4 | Un rechazo por esquema no revela detalles internos | Cubierto | `tests/hardening/SchemaValidation.test.ts` (`criterio 4`), `tests/forum/CreatePostSecurity.test.ts` (`criterio 4`) |
| 5 | Límite de tasa por usuario y por unidad de tiempo en puntos expuestos, ingesta y publicación en el foro | Cubierto (`CreatePost`); ingesta evaluada y descartada explícitamente (sin contraparte real) | `tests/hardening/EnforceRateLimit.test.ts` |
| 6 | Al superar el límite, se rechaza y el evento queda registrado | Cubierto (el código HTTP 429 en sí es del futuro adaptador) | `tests/hardening/EnforceRateLimit.test.ts` (`criterio 6`), `tests/infrastructure/mongo/MongoRateLimitAuditLog.integration.test.ts` |
| 7 | Contenido malicioso (inyección, scripts) neutralizado, verificado por prueba automatizada | Cubierto | `tests/infrastructure/mongo/NoSqlInjectionSafety.integration.test.ts`, `tests/hardening/HtmlEncoding.test.ts`, `tests/forum/CreatePostSecurity.test.ts` (`criterio 7`) |
| — | Definición de terminado (documento de Política de Seguridad) | Diferido | Documento de planeación fuera de este repositorio de código |
| — | Dominio desacoplado de infraestructura | Cubierto | `npm run check:architecture` |
