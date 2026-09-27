# Contexto de base de conocimiento (HU-41)

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

**HU-41 (SCRUM-53): base de conocimiento institucional administrable sin despliegue.** Trazabilidad: RF-66, RNF-15, RNF-18. Épica EP-09.

## Alcance

El administrador de contenido crea, edita y retira entradas de la base de conocimiento que el chatbot (HU-42) usa como fuente. Igual que HU-24, HU-30 y HU-50, no hay servidor HTTP ni panel real: se entregan los casos de uso que el panel invocará, con validación de esquema en el servidor.

| Pieza | Capa | Rol |
|---|---|---|
| `KnowledgeEntry`, `KnowledgeEntryVersion` | Dominio | Agregado con historial de versiones y retiro lógico |
| `validateNewKnowledgeEntry`, `validateKnowledgeEntryChanges` | Dominio (servicio) | Validación en servidor, campo por campo (criterio 5) |
| `rankKnowledgeEntries` | Dominio (servicio) | Búsqueda por coincidencia de palabras sobre entradas vigentes |
| `KnowledgeBasePort` | Puerto | Lectura para el chatbot: `search` y `findById`, solo entradas vigentes |
| `KnowledgeEntryRepositoryPort`, `KnowledgeAuditLogPort`, `ClockPort`, `KnowledgeEntryIdGeneratorPort` | Puertos | Persistencia, auditoría, hora e identificadores |
| `PublishKnowledgeEntry`, `EditKnowledgeEntry`, `WithdrawKnowledgeEntry` | Aplicación | Crear (1, 2, 5, 6), editar (1, 4, 5, 6), retirar (1, 3, 6) |
| `ListKnowledgeEntries`, `GetKnowledgeEntryHistory` | Aplicación | Listado del panel (con retiradas) e historial para auditoría |
| `RepositoryKnowledgeBase` | Infraestructura | `KnowledgeBasePort` sobre el repositorio, sin caché |
| `InMemory`/`Mongo` de entradas y auditoría | Infraestructura | Colecciones `knowledge_entries` y `knowledge_audit` |
| `config/knowledge-base.json` | Configuración | Categorías, límites de campos y límite de búsqueda |

## Decisiones

1. **`KnowledgeBasePort` separado de `ChatbotPort`.** La base de conocimiento es dato del dominio bajo control institucional, no conocimiento embebido en el modelo. El puerto es pequeño y estable (`search`, `findById`) y solo devuelve `KnowledgeSource`: la versión vigente, sin historial ni autores.
2. **Sin redespliegue.** No hay caché ni índice precalculado: cada consulta lee las entradas vigentes del repositorio. Una entrada publicada o retirada surte efecto en la siguiente pregunta (criterios 2 y 3). El esquema (categorías, límites) también es un JSON, no código.
3. **Retiro lógico e historial embebido.** Nada se borra. Cada edición real apila la versión anterior completa con `replacedAt` y `replacedBy` dentro del mismo documento (criterio 4). Editar sin cambiar valores no crea versión ni auditoría.
4. **Auditoría propia y append-only** (`KnowledgeAuditLogPort`), con usuario, acción, entrada y marca de tiempo (criterio 6), por la misma razón que `ConvocatoriaAuditLogPort`: es una decisión de contenido, no un evento de seguridad de cuenta.
5. **Autorización.** Los cinco casos de uso están en `config/protected-operations.json` con rol `content-admin` (HU-46); `check:authorization` los exige. El adaptador de entrada futuro llama a `AuthorizeOperation` antes de invocarlos, como con el resto de operaciones administrativas. Se nombró `Publish...` y no `Create...` porque el verbo `Create` no está en el patrón de `check:authorization`.
6. **Contenido sin marcado.** Título y contenido pasan por `neutralizeHtml` (HU-47) al entrar.

## Diferido

- Panel/formulario y capa HTTP: no existen en el proyecto.
- Cableado en `main.ts`: igual que `practices`, no hay adaptador de entrada al que conectarlo; HU-42 recibirá `KnowledgeBasePort` (`RepositoryKnowledgeBase` + `MongoKnowledgeEntryRepository`).
- Búsqueda semántica o full-text de Mongo: la actual es por palabras, suficiente para el volumen institucional; HU-42 puede reordenar.
