# Matriz de trazabilidad de requerimientos

Estado de cada requerimiento del SRS (RF-01 a RF-78 y RNF-01 a RNF-46) frente al código de este repositorio, a 18-oct-2026. Las cifras de pruebas y cobertura se midieron sobre este árbol (`npm run test:coverage`: 175 archivos, 1.388 pruebas en verde, cobertura 98,31 % de sentencias, 94,05 % de ramas, 99,11 % de funciones y 98,77 % de líneas; `npm audit`: 0 vulnerabilidades).

## Leyenda

| Código | Significado |
|---|---|
| **C** | Cumple: lógica con pruebas **y** accesible por la API HTTP (o verificable con medición) |
| **B** | Backend: lógica con pruebas automatizadas, pero sin endpoint HTTP ni cliente móvil que la use |
| **P** | Parcial: cumple una parte del criterio; la columna de notas dice cuál falta |
| **N** | No cumple: sin código |
| **S** | Sin evidencia: no se midió o no es verificable todavía |

Aplica a todo el producto: el cliente Android sigue sobre datos de ejemplo (`MockData.kt`) y no consume la API; el buzón institucional, el directorio institucional, el clasificador, el moderador, el chatbot (modelo de lenguaje) y el push son dobles o proveedores simples hasta que existan los servicios reales (T-01). La API HTTP expone hoy: `/auth/*`, `/messaging/*`, `/feed`, `/profile` y `/chatbot/ask`.

## Requerimientos funcionales

### Ingesta y normalización (contexto `ingestion`)

| RF | Estado | Notas |
|---|---|---|
| RF-01 a RF-08 | B | Conexión programada, lectura idempotente, metadatos, normalización, deduplicación, cuarentena, bitácora y reintento exponencial. El adaptador `ImapMailboxAdapter` no se conectó a un buzón real |

### Clasificación y extracción (`classification`, `targeting`)

| RF | Estado | Notas |
|---|---|---|
| RF-09 | B | Clasificador simple; proveedor de IA real pendiente |
| RF-10 | P | Los registros de segmentación solo los crean la corrección manual, la publicación y la edición; la ingesta no los genera sola |
| RF-11, RF-12 | B | Fecha de cierre (100 % sobre el corpus de 20 mensajes) y enlace de postulación |
| RF-13, RF-14 | B | Reglas configurables por remitente y por asunto |
| RF-15, RF-16 | B | Puntaje, umbral de revisión y reclasificación con realimentación |

### Noticias y convocatorias (`feed`, `personalization`)

| RF | Estado | Notas |
|---|---|---|
| RF-17 | P | `GET /feed` segmenta por programa, facultad, semestre y comunidad; depende de RF-10 para que la segmentación sea automática |
| RF-18 | C | `GET /feed` ordena por cierre ascendente y luego por publicación descendente (`orderByDeadline`) |
| RF-19 | C | Cada elemento trae `urgency`: `urgent` (menos de 72 h), `soon` (menos de 7 días) o `relaxed` |
| RF-20 | C | `?categories=beca,evento` filtra por varias categorías a la vez; valida contra las siete definidas |
| RF-21 | C | `?q=` busca en asunto y cuerpo, sin distinguir mayúsculas ni tildes |
| RF-22 | C | La respuesta incluye contenido completo, cierre, remitente y enlace |
| RF-23, RF-24 | B | Estado personal (leída, guardada, archivada) y sección de eventos generales |
| RF-25 | P | Caché real con Room (HU-17), pero sobre datos de ejemplo |

### Notificaciones (`notifications`)

| RF | Estado | Notas |
|---|---|---|
| RF-26 a RF-29 | B | Registro de dispositivo, avisos anticipados, aviso por nueva convocatoria, agrupación y límite diario. No existe `PushProviderPort`: nada se envía a un teléfono |
| RF-30 | N | Requiere el cliente móvil |

### Prácticas (`practices`)

| RF | Estado | Notas |
|---|---|---|
| RF-31 a RF-36 | B | Listado, filtros, detalle, seguimiento, recordatorio y carga manual. La ingesta aún no extrae empresa, requisitos ni modalidad |

### Mapa del campus (`campus`)

| RF | Estado | Notas |
|---|---|---|
| RF-37 | P | Catálogo, bloques y niveles detrás de `MapProviderPort`; sin render ni rendimiento móvil |
| RF-38, RF-39, RF-40 | N | Sin directorio buscable, ubicación del usuario ni trazado de ruta |
| RF-41 | B | Puntos de interés categorizados con filtro |
| RF-42 | P | La ingesta conserva el lugar declarado; no hay acceso directo desde el detalle |
| RF-43, RF-44, RF-45 | N | Sin modo sin conexión del mapa, reporte de inexactitud ni administración del catálogo (es un JSON de solo lectura) |

### Foro y moderación (`forum`, `moderation`, `reports`)

| RF | Estado | Notas |
|---|---|---|
| RF-46, RF-47 | B | Identidad verificada y temas por programa |
| RF-48, RF-49 | N | Sin comentarios ni reacciones |
| RF-50 a RF-52 | B | Moderación previa, decisión por umbral y retroalimentación. El modelo de moderación es un doble |
| RF-53, RF-54 | B | Reporte de la comunidad y ocultamiento preventivo (se dispara con 3 reportantes distintos) |
| RF-55, RF-56 | B | Sanciones graduales e historial por usuario |
| RF-57, RF-58 | N | Sin búsqueda en el foro ni edición y eliminación por el autor |

### Perfil y ajustes (`profile`, `notifications`)

| RF | Estado | Notas |
|---|---|---|
| RF-59, RF-60 | C | `GET /profile` y `PUT /profile` (semestre); los campos del directorio responden 403 |
| RF-61, RF-62 | B | Preferencias por categoría y anticipación de avisos |
| RF-63 | P | Tema claro y oscuro: sin verificar en el cliente |
| RF-64 | P | `POST /auth/logout` revoca el token e invalida el dispositivo; la purga local es del cliente |

### Chatbot (`chatbot`, `knowledge`)

| RF | Estado | Notas |
|---|---|---|
| RF-65 | C | `POST /chatbot/ask`: respuesta construida desde la base de conocimiento con un proveedor extractivo (sin modelo de lenguaje) |
| RF-66 | B | Base de conocimiento administrable con historial |
| RF-67, RF-68 | C | Cita la entrada de origen; si no hay información declara y envía al canal oficial, sin inventar |
| RF-69 | P | Contexto de los últimos 6 intercambios por sesión, pero solo en la memoria de la réplica |

### Autenticación y administración (`identity`, `consent`, `metrics`)

| RF | Estado | Notas |
|---|---|---|
| RF-70 | P | Login con cuentas locales (scrypt, nada se guarda en el dispositivo); no se valida contra el directorio institucional real |
| RF-71 | B | Consentimiento con fecha, hora y versión |
| RF-72 | C | Sesión firmada con expiración y refresco (`/auth/refresh`, `/auth/logout`) |
| RF-73 a RF-78 | B | Cuarentena, publicación y retiro, métricas, control de acceso por rol con registro, reglas de moderación y auditoría de decisiones |

## Requerimientos no funcionales

| RNF | Estado | Evidencia o nota |
|---|---|---|
| RNF-01 | P | Feed en ~174 ms con 20.050 documentos, medido en el servidor; no sobre 4G |
| RNF-02, RNF-03, RNF-05 | S | Sin medición del lote de 200 mensajes, de la latencia de avisos ni de la moderación |
| RNF-04 | S | Búsqueda en memoria sobre el feed ya segmentado; sin medición |
| RNF-06 | N | Mapa sin cliente |
| RNF-07 | C | 300 conexiones: 122 mil peticiones en 15 s, p99 94 ms; 300 logins sobre 3.013 usuarios sin errores |
| RNF-08 | C | Feed ~174 ms y foro ~219 ms con 20.000 documentos; N+1 corregido (~117x) |
| RNF-09 | S | La disponibilidad mensual no es medible aún |
| RNF-10 a RNF-12 | C | Pruebas de falla (buzón, clasificador, moderador); apagar una réplica bajo tráfico: 388 peticiones, 0 errores |
| RNF-13 | P | TLS 1.3 en Railway; falta la fijación de certificado en el cliente (HU-47 c2) |
| RNF-14 a RNF-16 | C | Rol verificado en el servidor, validación de entradas y límite de tasa compartido entre réplicas; `check:authorization` sin hallazgos |
| RNF-17 | P | Sin contraseña almacenada ni registrada; falta el almacenamiento seguro del token en el dispositivo |
| RNF-18, RNF-19 | C | Auditoría de acciones administrativas; el chatbot y el moderador reciben texto sin datos identificatorios |
| RNF-20 | C | Solo se guardan los datos de perfil necesarios |
| RNF-21 | N | No existe la función de ubicación |
| RNF-22 | P | Consulta, rectificación y supresión en el backend (`datarights`); no se exponen en la aplicación |
| RNF-23 | C | Consentimiento con fecha, hora y versión |
| RNF-24 | P | Archivo de vencidas aplicado; el feed aún no consulta el archivo (HU-48 c6) |
| RNF-25, RNF-26 | S | Sin medir con datos reales ni piloto (HU-57) |
| RNF-27 | P | 100 % sobre un corpus de 20 mensajes; sin muestra del piloto |
| RNF-28 | C | Cada resultado guarda categoría propuesta, puntaje y regla aplicada |
| RNF-29, RNF-30, RNF-31 | S | Sin corpus etiquetado ni operación real |
| RNF-32 | P | Diccionario configurable sin tocar código; el modelo de moderación es un doble |
| RNF-33 | C | Cada decisión conserva fragmento, categoría y puntaje |
| RNF-34 | P | Catálogo provisional en `config/campus-catalog.json` |
| RNF-35 | S | Sin muestreo en campo |
| RNF-36 | N | Sin reporte de inexactitud ni fecha de verificación |
| RNF-37, RNF-38, RNF-40 | S | Sin medición en la aplicación |
| RNF-39 | P | Mensajes del backend en español; interfaz sin auditar |
| RNF-41 a RNF-44 | C | `check:architecture`; adaptadores sustituibles por puertos; cobertura 98 %; dobles de falla del buzón, el clasificador y el moderador |
| RNF-45 | C | Android desde una única base de código |
| RNF-46 | C | `docs/ARQUITECTURA.md`: puertos, adaptadores y modelo documental |

## Resumen

| Estado | RF (78) | RNF (46) |
|---|---|---|
| C | 11 | 20 |
| B | 47 | 0 |
| P | 9 | 9 |
| N | 11 | 3 |
| S | 0 | 14 |

Lectura honesta: la lógica de negocio de la mayor parte del SRS existe y está probada, pero solo los requerimientos marcados **C** se pueden recorrer hoy de punta a punta por la API, y ninguno desde la aplicación móvil. Las brechas principales son la integración del cliente Android, los proveedores reales, el mapa y las métricas de calidad con datos reales (piloto).
