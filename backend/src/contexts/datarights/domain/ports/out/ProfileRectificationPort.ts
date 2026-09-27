export type ProfileRectificationOutcome =
  | {
      readonly kind: 'applied';
      readonly changes: readonly {
        readonly field: string;
        readonly previousValue: string | number | null;
        readonly newValue: string | number | null;
      }[];
    }
  /** El cambio toca datos que provee el directorio institucional (criterio 3). */
  | { readonly kind: 'directory-provided'; readonly fields: readonly string[] }
  | { readonly kind: 'rejected'; readonly message: string; readonly fields?: readonly string[] };

/** Rectificacion del perfil; la regla de que es editable sigue siendo del contexto `profile`. */
export interface ProfileRectificationPort {
  rectify(subject: string, changes: Readonly<Record<string, unknown>>): Promise<ProfileRectificationOutcome>;
}
