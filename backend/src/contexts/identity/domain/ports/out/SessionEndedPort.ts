/**
 * HU-40, criterio 3: lo que otros contextos deben descartar cuando una
 * sesión se cierra. `identity` solo conoce este puerto; hoy lo implementa un
 * adaptador que descarta la conversación del chatbot de esa sesión.
 */
export interface SessionEndedPort {
  /** Idempotente: una sesión sin nada que descartar no es un error. */
  sessionEnded(sessionId: string): Promise<void>;
}
