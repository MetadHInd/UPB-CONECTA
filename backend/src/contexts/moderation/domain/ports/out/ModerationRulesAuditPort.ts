export interface ModerationThresholdValues {
  readonly lower: number;
  readonly upper: number;
}

/**
 * Auditoría de los cambios de reglas (HU-52 criterio 3), append-only. Los
 * cambios del diccionario también se auditan: quitar una expresión afloja la
 * moderación tanto como subir un umbral.
 */
export type ModerationRulesChange =
  | {
      readonly kind: 'thresholds-changed';
      readonly previous: ModerationThresholdValues;
      readonly next: ModerationThresholdValues;
      readonly performedBy: string;
      readonly occurredAt: Date;
    }
  | {
      readonly kind: 'banned-term-added' | 'banned-term-removed';
      readonly term: string;
      readonly performedBy: string;
      readonly occurredAt: Date;
    };

export interface ModerationRulesAuditPort {
  record(change: ModerationRulesChange): Promise<void>;
  /** Más reciente primero. */
  findAll(): Promise<readonly ModerationRulesChange[]>;
}
