# Contexto del chatbot (HU-42, HU-40)

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

## HU-40 (SCRUM-52): consulta en lenguaje natural con contexto conversacional de sesión

Trazabilidad: RF-65, RF-69, RNF-19, RNF-39. Épica EP-09. Sin capa HTTP ni cliente: se entregan los casos de uso.

### Piezas

| Pieza | Capa | Rol |
|---|---|---|
| `ChatbotConversation`, `ConversationTurn` | Dominio | Contexto de la sesión: últimos 6 intercambios, ya enmascarados, y las entradas citadas |
| `ConversationContextStorePort` + `InMemoryConversationContextStore` | Puerto / infraestructura | Contexto efímero; **solo** adaptador en memoria |
| `ConverseWithChatbot` | Aplicación | Pregunta dentro de la conversación (criterios 1 a 6) |
| `EndChatbotConversation` | Aplicación | Descarta la conversación al cerrar la sesión (criterio 3) |
| `ChatbotRequest.history` y `responseLanguage` | Puerto | El modelo recibe el historial y la instrucción de responder en español |
| `AnswerStudentQuestion` (ampliado) | Aplicación | Recibe el contexto, suma las entradas citadas antes y enmascara lo que envía |
| `maskPersonalData` (`hardening`) | Dominio compartido | Enmascaramiento de datos identificatorios, extraído de la moderación (HU-31) para usarlo aquí también |
| `SessionEndedPort` + `ChatbotConversationSessionEndedAdapter` (`identity`) | Puerto / infraestructura | `LogoutSession` avisa del cierre y el chatbot descarta la conversación |

### Decisiones

1. **La conversación se identifica con el `sessionId` de la sesión autenticada** (la cadena de refresh tokens de HU-45, que `VerifyAccessToken` entrega en el `principal`). Es opaco: la conversación no guarda el correo, el nombre ni ningún dato de la identidad, y no forma parte del perfil (RNF-20). Tras cerrar la sesión, ese `sessionId` ya no pasa `VerifyAccessToken`, así que tampoco se podría retomar.
2. **Descarte (criterio 3).** Tres vías: `LogoutSession` invoca `SessionEndedPort` después de revocar la cadena (mismo patrón que la baja del dispositivo en HU-39); 30 minutos sin actividad (`DEFAULT_CONVERSATION_IDLE_MS`) descartan la conversación en la siguiente consulta de cualquier sesión; y un reinicio del proceso las pierde todas. No existe un adaptador persistente, a propósito.
3. **Seguimiento (criterio 2).** El modelo recibe los intercambios previos, y las entradas de la base de conocimiento citadas en la conversación se suman a las que se recuperan para la pregunta nueva, si siguen vigentes. Así "¿y cuánto se demora?" se responde con la entrada del carnet, aunque la pregunta sola no la encuentre. La respuesta sigue sujeta al invariante de anclaje de HU-42.
4. **Enmascaramiento (criterio 4).** `ConverseWithChatbot` enmascara la pregunta con la identidad de quien pregunta (nombre, usuario, identificador estudiantil) antes de guardarla o usarla; `AnswerStudentQuestion` vuelve a enmascarar correos y números largos antes de llamar al proveedor, para cubrir también el uso directo de HU-42. `ChatbotRequest` no tiene campos de identidad.
5. **Escalamiento (criterio 5).** Es el mismo de HU-42. Desde una conversación no se le pasa el estudiante, así que el registro de escalamiento queda sin identidad (`studentId: null`) y con la pregunta enmascarada.
6. **Español (criterio 6).** Los mensajes propios están en español y cada solicitud lleva `responseLanguage: 'es'`. Que el proveedor la respete es responsabilidad de su adaptador; el stub no puede verificarlo.
7. **Seis intercambios de contexto.** Suficiente para seguir una conversación y acota lo que viaja al proveedor.

### Limitaciones explícitas

- **La conversación de una sesión revocada por otras vías** (reuso de refresh token, supresión de HU-48) no se descarta en el acto: ese `sessionId` ya no se puede usar y la conversación se descarta por inactividad a los 30 minutos.
- **El contexto vive en la memoria de un solo proceso.** Con varias instancias del servidor, cada una tendría el suyo; hace falta afinidad de sesión o un almacén compartido y efímero (con expiración) cuando se monte el servidor.
- **El idioma de la respuesta del modelo** no se verifica en el dominio (ver decisión 6).

### Criterios de aceptación y pruebas

| # | Criterio | Pruebas |
|---|---|---|
| 1 | Respuesta desde la base de conocimiento | `tests/chatbot/ChatbotConversation.test.ts` › criterio 1; `AnswerStudentQuestion.test.ts` (HU-42) |
| 2 | La pregunta de seguimiento conserva el contexto | › criterio 2 (seguimiento, otra sesión sin contexto, entradas nuevas y citadas, límite de intercambios) |
| 3 | Al cerrar la sesión el contexto se descarta y no queda asociado a la identidad | › criterio 3 (con `LogoutSession` real de `identity`, inactividad, sin identidad guardada) |
| 4 | Sin datos identificatorios hacia el proveedor | › criterio 4 (pregunta e historial enmascarados, sin campos de identidad, uso directo de HU-42) |
| 5 | Escalamiento de HU-42 | › criterio 5 |
| 6 | Respuestas en español | › criterio 6 |

Mutaciones comprobadas: no sumar las entradas citadas hace fallar 4 pruebas; no enviar el historial, 1; no enmascarar en `AnswerStudentQuestion`, 1; ignorar la identidad al enmascarar, 3; no descartar por inactividad, 1; no descartar al cerrar sesión, 1; sin límite de intercambios, 1; guardar preguntas vacías, 1.
