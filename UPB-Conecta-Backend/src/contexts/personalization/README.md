# UPB Conecta, contexto de personalización

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de **HU-16 (SCRUM-28): Marcado de estado personal y sección separada de eventos de interés general** — **parcial**: criterios 1, 2, 3 y 5 completos; criterio 4 parcial. Trazabilidad: RF-23, RF-24.

Tercer contexto del backend fuera de `ingestion` (junto a `consent` y `notifications`), mismo patrón hexagonal.

## Alcance: qué cubre esta historia y qué queda diferido/parcial

"El estado de lectura es una entidad de relación estudiante-convocatoria, no un campo del documento de
convocatoria" (diseño de la historia en Jira) — evita contención de escritura sobre un documento leído por
miles de usuarios, y por construcción dos estudiantes nunca comparten fila (criterio 5).

- **`ConvocatoriaPersonalState`** (dominio): tres banderas independientes (`read`, `saved`, `archived`) por
  `studentId` + `convocatoriaId`. `convocatoriaId` es un identificador opaco para este contexto — lo produce
  `ingestion` (HU-15), aquí no importa cómo se construye, solo que identifica una convocatoria de forma
  estable.
- **`UpdatePersonalState`** (aplicación): aplica solo las banderas recibidas sobre el estado vigente (o los
  valores por defecto en el primer marcado) — marcar una convocatoria como archivada no le quita el
  "guardada" que ya tenía (criterios 1, 2, 3).
- **`GetPersonalState`**, **`ListSavedConvocatorias`**, **`ListArchivedConvocatorias`** (aplicación): consultas
  de lectura para "se refleja al reabrir" (criterio 1), la vista de guardados (criterio 2) y la recuperación
  de archivados (criterio 3).
- **`PersonalStateRepositoryPort`** + adaptadores en memoria y MongoDB: upsert por `studentId+convocatoriaId`
  — solo importa el estado vigente, no un histórico de cambios.
- **`hasNoDeadline`** (dominio, criterio 4 **parcial**): evalúa la mitad "sin plazo" del criterio 4
  reutilizando el `DueDate` de `ingestion` (HU-08) — se importa el tipo de dominio en vez de duplicarlo,
  porque a diferencia de `ClockPort` (arbitrario, se duplica por contexto), la interpretación de "sin plazo"
  tiene que coincidir exactamente con la que ya produce HU-08. La mitad "dirigido a toda la comunidad" queda
  **diferida**: depende de la asignación de programas académicos (HU-07, no implementada) — sin ella no hay
  forma de distinguir "sin programa asignado" (comunidad) de "programa sin clasificar todavía". Un futuro
  feed debe combinar `hasNoDeadline` con la señal de HU-07 antes de decidir la sección.

## Estructura

    src/contexts/personalization/
      domain/          ConvocatoriaPersonalState, hasNoDeadline, puertos (in/out).
      application/     UpdatePersonalState, GetPersonalState, ListSavedConvocatorias, ListArchivedConvocatorias.
      infrastructure/  adaptadores en memoria y MongoDB, reloj.

No está conectado a `src/main.ts` (raíz de composición del scheduler de *ingesta*): este contexto no tiene
todavía un proceso ni una capa HTTP propia desde la cual el estudiante marque una convocatoria.

## Criterios de aceptación y dónde se verifican

| Criterio | Estado | Prueba |
|---|---|---|
| 1. Marcar como leída se persiste y se refleja al reabrir | Cubierto | `PersonalStateUseCases.test.ts`, `MongoPersonalStateRepository.integration.test.ts` |
| 2. Guardar → accesible en una vista independiente del feed | Cubierto | `PersonalStateUseCases.test.ts`, `MongoPersonalStateRepository.integration.test.ts` |
| 3. Archivar → no aparece en el listado principal pero es recuperable | Cubierto | `PersonalStateUseCases.test.ts`, `MongoPersonalStateRepository.integration.test.ts` |
| 4. Mensaje a toda la comunidad y sin plazo → sección de interés general | Parcial (solo "sin plazo") | `GeneralInterestClassifier.test.ts` |
| 5. El estado personal es independiente por estudiante | Cubierto | `PersonalStateUseCases.test.ts` |
