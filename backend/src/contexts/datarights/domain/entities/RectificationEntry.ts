/** Una correccion aplicada por el titular, con fecha (HU-48 criterio 2). */
export interface RectificationEntry {
  readonly subject: string;
  readonly field: string;
  readonly previousValue: string | number | null;
  readonly newValue: string | number | null;
  readonly rectifiedAt: Date;
}
