/**
 * Registro de intentos rechazados sobre temas restringidos (HU-30 criterio 4).
 * Puerto propio del foro y no `SecurityAuditLogPort` de HU-45: aquel describe
 * tokens rechazados (`tokenKind`, `TokenRejectionReason`), y forzar este evento
 * en ese vocabulario acoplaria el foro a los detalles de la sesion.
 */
export interface ForumAccessDeniedEvent {
  readonly kind: 'topic-access-denied';
  readonly operation: 'read' | 'publish';
  readonly studentEmail: string;
  readonly studentProgramId: string | null;
  readonly topicId: string;
  readonly occurredAt: Date;
}

export interface ForumAccessAuditPort {
  record(event: ForumAccessDeniedEvent): Promise<void>;
}
