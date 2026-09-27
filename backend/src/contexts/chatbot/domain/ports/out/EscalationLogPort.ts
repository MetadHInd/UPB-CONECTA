export type EscalationReason = 'no-information' | 'unanchored-response' | 'provider-failure';

export interface EscalationRecord {
  readonly question: string;
  readonly studentId: string | null;
  readonly reason: EscalationReason;
  readonly detail: string;
  readonly at: Date;
}

/** Flujo de escalamiento: deja constancia de la pregunta que el chatbot no pudo responder. */
export interface EscalationLogPort {
  record(escalation: EscalationRecord): Promise<void>;
}
