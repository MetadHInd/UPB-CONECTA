export enum ConvocatoriaAuditEventKind {
  PUBLISHED = 'published',
  WITHDRAWN = 'withdrawn'
}

/**
 * HU-50, criterio 6: toda publicacion o retiro manual queda auditado con
 * usuario, accion, objeto afectado y marca de tiempo. Append-only (ver
 * adaptador Mongo) — mismo patron que `MongoForumAccessAuditLog` (HU-30),
 * `MongoClassificationCorrectionRepository` (HU-11) y
 * `MongoAuthorizationAuditLog` (HU-46).
 *
 * No se reutilizo `AuthorizationAuditLogPort` (identity, HU-46): ese log
 * esta acotado a "intentos no autorizados" y "cambios de rol" — eventos de
 * seguridad de una cuenta. Publicar o retirar contenido es una decision de
 * negocio sobre una convocatoria, con un "objeto afectado" que ese contrato
 * no modela. Mezclar ambos conceptos en una sola union obligaria a que el
 * log de seguridad conozca convocatorias, o a que este conozca roles.
 */
export interface ConvocatoriaAuditEvent {
  readonly kind: ConvocatoriaAuditEventKind;
  readonly convocatoriaId: string;
  readonly messageId: string;
  readonly actor: string;
  readonly occurredAt: Date;
}

export interface ConvocatoriaAuditLogPort {
  record(event: ConvocatoriaAuditEvent): Promise<void>;
}
