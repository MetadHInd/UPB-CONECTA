export enum KnowledgeAuditEventKind {
  CREATED = 'created',
  EDITED = 'edited',
  WITHDRAWN = 'withdrawn'
}

/**
 * HU-41 criterio 6: todo cambio queda auditado con usuario, accion, objeto
 * afectado y marca de tiempo. Append-only, mismo patron que
 * `ConvocatoriaAuditLogPort` (HU-50). Contrato propio por la misma razon que
 * aquel: es una decision de contenido, no un evento de seguridad de cuenta.
 */
export interface KnowledgeAuditEvent {
  readonly kind: KnowledgeAuditEventKind;
  readonly entryId: string;
  readonly actor: string;
  readonly occurredAt: Date;
  /** Version de la entrada resultante del cambio. */
  readonly version: number;
  /** Solo en `EDITED`: campos que cambiaron. */
  readonly changedFields?: readonly string[];
}

export interface KnowledgeAuditLogPort {
  record(event: KnowledgeAuditEvent): Promise<void>;
  /** Eventos de una entrada, del mas antiguo al mas reciente. */
  findByEntryId(entryId: string): Promise<readonly KnowledgeAuditEvent[]>;
}
