# UPB Conecta, contexto de clasificación

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

Implementación de la historia **HU-06**: clasificación de mensajes institucionales. Trazabilidad: **RF-09, RNF-42. CU-01 paso 6, excepción E3**.

## Alcance

Este contexto crea el catálogo de categorías del dominio, explora el puerto de salida `ClassificationPort.classify(message)` y modela tanto el almacenamiento de resultados como la cola de reintento cuando el proveedor no responde.

## Catálogo de dominio

Se declara como enumeración del dominio en `src/contexts/classification/domain/value-objects/MessageCategory.ts`:

- convocatoria con plazo
- evento
- beca
- movilidad
- curso de idiomas
- práctica
- boletín informativo

Este catálogo se usa como único origen de verdad para asignar la categoría y para validar que el resultado final del clasificador sea una de esas 7 opciones.

## Puertos y adaptadores

- `ClassificationPort`: contrato del proveedor de IA. La firma usa el tipo ya existente `InstitutionalMessage` del contexto de ingesta para no duplicar modelos paralelos.
- `ClassificationResultRepositoryPort`: persiste la categoría propuesta, la definitiva y la bandera del falso positivo del piloto.
- `ClassificationRetryQueuePort`: guarda mensajes normales sin clasificar cuando la llamada al proveedor falla.

### Adaptador en memoria

`InMemoryClassificationAdapter` usa reglas simples sobre asunto y cuerpo para devolver una categoría válida. Es un stub explícito y documentado para pruebas y para escenarios de integración, que cumple con la restricción del repositorio: no hay un proveedor real de IA ni una API disponible en este entorno.

### Adaptador Mongo

`MongoClassificationRetryQueue` y `MongoClassificationResultRepository` siguen el mismo patrón que el resto de repositorios del proyecto: manteniendo persistencia real en MongoDB y capas desacopladas del dominio.

## Comportamiento de la integración

- Si el proveedor responde, el caso de uso `ClassifyInstitutionalMessage` persiste el resultado con las dos categorías (`proposedCategory` y `finalCategory`) y la bandera de falso positivo.
- Si el proveedor falla, el documento normalizado se conserva tal cual y se registra en la cola de reintento de clasificación, sin marcarlo como publicado ni listo para feed.
- La diferencia entre categoría propuesta y definitiva queda explícita en el modelo para soportar revisión o calibración futura sin cambiar el contrato de persistencia.

## Diferido explícitamente

- Proveedor real de IA: no existe API ni acceso ni credenciales en este repositorio; se deja un adaptador en memoria como stub documentado.
- Métrica de HU-10: la evaluación del clasificador y la medición de precisión sobre la clase de interés queda fuera de este alcance, según la propia historia.

## Criterios de aceptación y pruebas

| Criterio | Descripción | Prueba correspondiente |
|---|---|---|
| 1 | Exactamente una categoría válida para un mensaje normalizado | `tests/classification/ClassificationFlow.test.ts` (`asigna exactamente una categoria valida a un mensaje normalizado`) |
| 2 | Error del proveedor -> se guarda en la cola de reintento y no se publica | `tests/classification/ClassificationFlow.test.ts` (`guarda el mensaje sin clasificar en la cola de reintento cuando falla el servicio`) |
| 3 | Se conservan la propuesta y la definitiva en el resultado persistido | `tests/classification/ClassificationFlow.test.ts` + `tests/infrastructure/mongo/MongoClassificationResultRepository.integration.test.ts` |
| 4 | El falso positivo del piloto queda explícitamente registrado | `tests/classification/ClassificationFlow.test.ts` (`conserva la categoria propuesta y la definitiva y registra el falso positivo del piloto`) |
| 5 | La persistencia real del resultado y la cola de reintento funciona en Mongo | `tests/infrastructure/mongo/MongoClassificationResultRepository.integration.test.ts`, `tests/infrastructure/mongo/MongoClassificationRetryQueue.integration.test.ts` |
| 6 | El dominio de clasificación queda desacoplado de la infraestructura y la arquitectura sigue respetada | `tests/infrastructure/check-architecture.test.ts` + `npm run check:architecture` |
