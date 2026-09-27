# Contexto de campus (HU-25)

> Documentación específica de este contexto acotado. Para la visión general del proyecto y la arquitectura, ver el [README raíz](../../../README.md).

**HU-25 (SCRUM-37): mapa interactivo del campus de Bucaramanga con puntos de interés categorizados.** Trazabilidad: RF-37, RF-41, RNF-06, RNF-42. Épica EP-06.

## Alcance

Igual que HU-24 y HU-30, no hay servidor HTTP ni cliente móvil: se entregan el catálogo de espacios, los casos de uso que el módulo de mapa invocará y el puerto del proveedor de cartografía.

| Pieza | Capa | Rol |
|---|---|---|
| `CampusCatalog` (campus, bloques, edificios, niveles, puntos de interés) | Dominio | Agregado propio con coordenadas |
| `PoiCategory` | Dominio | Cafetería, biblioteca, bienestar, coordinación, punto de atención, parqueadero, servicio sanitario |
| `assertValidCampusCatalog` | Dominio (servicio) | Integridad: ids únicos, coordenadas válidas, referencias a edificio y nivel |
| `filterPointsOfInterest` | Dominio (servicio) | Filtro por categoría, edificio y nivel |
| `CampusCatalogRepositoryPort`, `MapProviderPort` | Puertos | |
| `GetCampusMap`, `FilterPointsOfInterest`, `SelectBuildingLevel` | Aplicación | Criterios 1, 3 y 4 |
| `InMemoryCampusCatalogRepository`, `InMemoryMapProvider`, `loadCampusCatalog` | Infraestructura | Repositorio y doble del proveedor; carga de `config/campus-catalog.json` |

## Decisiones

1. **El catálogo es del dominio, no una capa del proveedor.** `MapProviderPort.render(scene)` recibe una escena con tipos del dominio (centro, marcadores, foco en un nivel) y no devuelve datos. Sustituir el proveedor implica escribir otro adaptador de ese puerto; ni el catálogo ni los casos de uso cambian (criterio 5).
2. **Datos semilla como configuración.** `config/campus-catalog.json` se valida al cargarse. **Las coordenadas, nombres de bloques y niveles son un ejemplo aproximado**: deben reemplazarse por el levantamiento real del campus antes de usarse.
3. **Puntos de interés en un edificio llevan nivel; al aire libre no** (por ejemplo, parqueaderos). La validación lo exige.
4. **Sin `MongoCampusCatalogRepository`.** El catálogo se lee del archivo de configuración; una colección solo haría falta si se edita en línea (historia futura).

## Autorización (HU-46)

Los casos de uso son de solo lectura para cualquier estudiante autenticado; sus nombres no coinciden con verbos administrativos, por lo que no requieren entrada en `config/protected-operations.json`.

## Criterios de aceptación y pruebas

Todas en `tests/campus/CampusMap.test.ts`.

| # | Criterio | Estado |
|---|---|---|
| 1 | Campus con bloques, edificios y niveles | Datos y caso de uso cubiertos (› criterio 1). El dibujo en pantalla es del cliente Android: diferido |
| 2 | Desplazamiento y zoom en menos de 2 s | Diferido: es rendimiento de renderizado en el cliente (`Frontend/`, Compose) |
| 3 | Filtrar siete categorías | Cubierto (› criterio 3) |
| 4 | Alternar niveles de un edificio | Cubierto (› criterio 4) |
| 5 | Cambiar de proveedor sin tocar catálogo ni dominio | Cubierto (› criterio 5: dos proveedores, misma respuesta, catálogo intacto y sin vocabulario de proveedor) |

## Pendientes

- **Cliente Android:** renderizado del mapa y medición del criterio 2 (RNF-06).
- **Adaptador real de `MapProviderPort`** (proveedor de cartografía elegido) y capa HTTP.
- **HU-15 criterio 5** depende de este catálogo de espacios (ubicación de una convocatoria en el campus): debe consultar `CampusCatalogRepositoryPort`.
