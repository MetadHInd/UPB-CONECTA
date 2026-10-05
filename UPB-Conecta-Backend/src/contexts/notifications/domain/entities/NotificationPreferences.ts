/**
 * HU-38 (RF-61, RF-62, RF-63, RNF-38): preferencias de aviso de un
 * estudiante. "Es entidad de dominio consultada por el planificador de
 * avisos, no una configuracion local del cliente" (diseno de la historia en
 * Jira) — de ahi que viva aqui y no en el dispositivo.
 *
 * `categoryPreferences` es opt-out: una categoria ausente del mapa se
 * considera activa. Eso evita que agregar una categoria nueva al catalogo
 * (todavia no existe un catalogo formal, lo aportara la clasificacion)
 * silencie avisos que el estudiante nunca desactivo explicitamente.
 */
export type ThemePreference = 'light' | 'dark';

export interface NotificationPreferences {
  readonly studentId: string;
  readonly categoryPreferences: Readonly<Record<string, boolean>>;
  readonly leadTimeMinutes: number;
  readonly theme: ThemePreference;
  readonly updatedAt: Date;
}

/**
 * Valores de anticipacion admitidos (criterio 5): 1 hora, 3 horas, 1 dia,
 * 3 dias antes del vencimiento. El ticket no los enumera; se fija aqui como
 * el catalogo que el servidor valida, ajustable sin tocar el resto del
 * dominio.
 */
export const ALLOWED_LEAD_TIMES_MINUTES: readonly number[] = [60, 180, 1440, 4320];

export const DEFAULT_LEAD_TIME_MINUTES = 1440;
export const DEFAULT_THEME: ThemePreference = 'light';

export function defaultPreferences(studentId: string, at: Date): NotificationPreferences {
  return {
    studentId,
    categoryPreferences: {},
    leadTimeMinutes: DEFAULT_LEAD_TIME_MINUTES,
    theme: DEFAULT_THEME,
    updatedAt: at
  };
}
