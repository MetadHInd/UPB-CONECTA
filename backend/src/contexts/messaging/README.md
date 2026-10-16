# Contexto de mensajería (profesor ↔ estudiante)

Conversaciones privadas 1 a 1 entre un profesor y un estudiante, guardadas en MongoDB (`messaging_conversations`, mensajes embebidos).

## Reglas (todas verificadas en el servidor)

- Solo una cuenta con rol `professor` puede iniciar una conversación, y el destinatario debe ser una cuenta con rol `student`. El rol se lee del directorio de `identity` en cada petición (HU-46), nunca del cliente.
- Solo los dos participantes pueden leer o escribir. A cualquier otro se le responde `404`, igual que si la conversación no existiera.
- Quien hace la petición sale del token de sesión (`requireSession`, HU-45); un campo de autor en el cuerpo se ignora.
- Asunto: 1–120 caracteres. Mensaje: 1–2000 caracteres. El texto se guarda tal cual (recortado): Android lo pinta como texto plano; un cliente web debe escaparlo al mostrarlo.

## API (todas con `Authorization: Bearer <accessToken>`)

| Método | Ruta | Quién | Respuesta |
|---|---|---|---|
| GET | `/messaging/conversations` | cualquiera | `{ ok, conversations: [resumen con lastMessage] }`, más reciente primero |
| GET | `/messaging/conversations/:id` | participantes | `{ ok, conversation }` con todos los mensajes |
| POST | `/messaging/conversations` `{ studentEmail, subject, text }` | profesor | `201 { ok, conversation }` |
| POST | `/messaging/conversations/:id/messages` `{ text }` | participantes | `201 { ok, message }` |
| GET | `/messaging/students` | profesor | `{ ok, students: [{ email, name, program, semester }] }` |

Errores: `401` sesión (con `requiresReauthentication: false` si basta renovar con `POST /auth/refresh`), `403 forbidden`, `404 not-found`, `400 invalid-content`.

## Arquitectura

- `domain/`: `Conversation`, `MessagingFailure`, puertos `ConversationRepositoryPort`, `MessagingDirectoryPort`, `ClockPort`, `MessagingIdGeneratorPort`. No importa nada de otros contextos.
- `application/`: `StartConversation`, `SendMessage`, `ListConversations`, `GetConversation`, `ListMessagingStudents`.
- `infrastructure/`: `MongoConversationRepository`, `InMemoryConversationRepository`, `IdentityMessagingDirectoryAdapter` (implementa el directorio sobre las cuentas y roles de `identity`; cruza el límite de contexto solo aquí) y `http/messagingRoutes.ts`.
