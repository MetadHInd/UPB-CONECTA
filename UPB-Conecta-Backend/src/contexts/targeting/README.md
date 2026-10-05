# Contexto de segmentación de programas

> Documentación específica de la historia **HU-07**. El número exacto de la historia se trata como inferencia funcional pendiente de confirmar por la hoja de ruta del proyecto; el alcance funcional aquí se limita a la segmentación de programas según RF-10.

## Alcance

Este contexto resuelve la segmentación institucional para mensajes masivos a partir de un catálogo externo de programas y facultades. No implementa un feed de estudiante ni un caso de uso de consulta por perfil de usuario; esa parte corresponde a HU-12. Lo que sí queda garantizado aquí es que la segmentación calculada se persiste y puede consultarse directamente por `messageId`.

## Decisión de diseño

Se crea un contexto propio en `src/contexts/targeting/` porque la segmentación de programas es un concepto de dominio con reglas propias, distinta de la clasificación (HU-06) y sin depender directamente del comportamiento del feed. Mantiene la regla de arquitectura del repo: el dominio no conoce infraestructura ni MongoDB.

## Catálogo institucional

El catálogo vivo de facultades y programas se mantiene como dato de configuración externa al código fuente, en `backend/config/program-catalog.json`.

Formato:

```json
{
  "faculties": [
    {
      "id": "ingenieria",
      "name": "Facultad de Ingeniería",
      "programIds": ["sistemas", "industrial"]
    }
  ],
  "programs": [
    { "id": "sistemas", "name": "Ingeniería de Sistemas", "facultyId": "ingenieria" }
  ]
}
```

Esto cumple el criterio 4: cualquier actualización del catálogo requiere cambiar los datos, no recompilar TypeScript ni tocar un enum.

## Value object de dominio

`ProgramTargeting` es un value object con semántica de conjunto y variantes explícitas:

- `all-community`: toda la comunidad.
- `faculty`: todos los programas de una facultad.
- `programs`: uno o varios programas específicos.

La resolución de la jerarquía facultad → programa se hace con un servicio de dominio puro, `FacultyProgramResolver`, que recibe el catálogo ya cargado y devuelve el conjunto de programas de la facultad sin I/O directo.

### Filtro de semestre (HU-37)

`SemesterRange` (`{ min, max | null }`) es un filtro **ortogonal** a `ProgramTargeting`: un registro de targeting puede llevar `semesterRange` además de su segmentación por programa, facultad o toda la comunidad. Si falta, no hay restricción. `ProgramTargetingResolver` todavía no lo extrae del texto del mensaje. Ver `src/contexts/profile/README.md`.

## Persistencia consultable

Se expone un puerto de salida `ProgramTargetingRepositoryPort` con:

- `save(record)`
- `findByMessageId(messageId)`
- `findByMessageIds(messageIds)` — HU-55, criterio 2: versión en lote, aditiva (no reemplaza `findByMessageId`, que casos de uso puntuales como `CorrectClassification`, `PublishConvocatoria`, `PublishReviewQueueItem`, `EmitDueDateReminders` y `NotifyProgramTargetedPublication` siguen usando). `GetSegmentedFeed` la usa para resolver targeting de toda una página del feed en una sola consulta en vez de una por convocatoria (N+1 real con 20k documentos consolidados). `MongoProgramTargetingRepository` la resuelve con un único `$in` sobre `_id` (= `messageId`, indexado por defecto). Detalle completo del hallazgo y la corrección en el [README de `feed`](../feed/README.md#hu-55-scrum-67--criterio-2-rendimiento-del-feed-y-del-foro-con-20000-documentos).

Implementaciones:

- `InMemoryProgramTargetingRepository` para pruebas unitarias
- `MongoProgramTargetingRepository` para integración real contra MongoDB

## Criterios de aceptación y pruebas

| Criterio | Prueba correspondiente |
|---|---|
| Dado un mensaje institucional, cuando se clasifica, el sistema determina el conjunto de programas destinatarios | `tests/targeting/ProgramTargeting.test.ts` (`determina un conjunto explícito de programas destinatarios`) |
| Dado un mensaje sin mención explícita, se asigna a toda la comunidad | `tests/targeting/ProgramTargeting.test.ts` (`asigna toda la comunidad cuando no hay mención explícita de programa`) |
| Dado un mensaje dirigido a una facultad completa, se registra la facultad y alcanza a todos sus programas | `tests/targeting/ProgramTargeting.test.ts` (`expande una facultad completa al conjunto de sus programas`) |
| Dado el catálogo institucional, cuando cambia, se actualiza como configuración externa | `tests/targeting/ProgramTargeting.test.ts` (`carga el catálogo institucional desde un archivo externo de configuración`) |
| Dado un mensaje con destinatarios asignados, la persistencia consultada coincide exactamente con lo calculado | `tests/targeting/ProgramTargeting.test.ts` + `tests/infrastructure/mongo/MongoProgramTargetingRepository.integration.test.ts` |

## Nota de alcance

El criterio de consulta desde un feed real de estudiante es responsabilidad de HU-12, no de esta historia. Aquí solo se garantiza la segmentación calculada y persistida en un repositorio consultable directamente.
