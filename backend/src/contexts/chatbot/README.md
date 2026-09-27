# Contexto del chatbot (HU-42)

> Para la visión general del proyecto, ver el [README raíz](../../../README.md).

**HU-42 (SCRUM-54): respuesta anclada a la fuente y escalamiento ante ausencia de información.** Trazabilidad: RF-67, RF-68. Épica EP-09.

Como en HU-24 y HU-35, no hay capa HTTP ni cliente móvil: se entrega el caso de uso `AnswerStudentQuestion` con un doble del proveedor de IA (`StubChatbot`).

## Decisión: la no alucinación es un invariante de dominio

La regla no es una instrucción al proveedor. `anchorResponse` (dominio) se aplica sobre la salida del modelo: la respuesta se entrega solo si tiene texto, al menos una fuente y **todas** sus fuentes existen y están vigentes en el repositorio. Cualquier otro caso (sin fuentes, cita inexistente, entrada vencida, convocatoria retirada, salida sin forma, fallo del proveedor) no se entrega y se escala: fail-safe, como la moderación.

Orden: alcance excluido (antes del modelo) → entradas vigentes de la base de conocimiento (sin ellas no se llama al modelo) → generación → verificación de fuentes.

## Piezas

| Pieza | Capa | Rol |
|---|---|---|
| `AnchoringPolicy`, `OutOfScopeDetector` | Dominio | Invariante de anclaje; exclusión de notas/estado académico |
| `ChatbotPort`, `KnowledgeBasePort`, `ConvocatoriaReferencePort`, `EscalationLogPort`, `ClockPort` | Puertos de salida | |
| `AnswerStudentQuestion` | Aplicación | Caso de uso; resultado `answered`, `out-of-scope`, `escalated`, `invalid-question` |
| `RegistryConvocatoriaReference` | Infraestructura | Lee convocatorias con `findById` del registro consolidado de `ingestion` |
| `InMemoryKnowledgeBase`, `StubChatbot`, `InMemoryEscalationLog` | Infraestructura | Dobles |
| `JsonChatbotConfig` | Infraestructura | Lee `config/chatbot-official-channel.json` y `config/chatbot-out-of-scope.json` |

## Contrato con HU-41

`KnowledgeBasePort` es mínimo y propio; HU-41 lo reemplaza o lo cumple:

```ts
interface KnowledgeBasePort {
  searchCurrent(query: string): Promise<KnowledgeEntry[]>; // solo vigentes
  findById(id: string): Promise<KnowledgeEntry | null>;
}
interface KnowledgeEntry { id: string; title: string; content: string; validUntil: Date | null }
```

## Pendientes

- Los datos del canal oficial en `config/chatbot-official-channel.json` son provisionales: confirmar con la universidad.
- Persistencia real del registro de escalamiento (hoy solo `InMemoryEscalationLog`) y adaptador real del proveedor de IA.
- La navegación al detalle es del cliente: la respuesta entrega el `ConvocatoriaId` completo (HU-15).
- El modelo no recibe convocatorias como contexto; solo puede citarlas por id y se verifican igual.
