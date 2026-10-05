/**
 * HU-21 (RF-29, RF-30): un aviso pendiente de emitir, ya filtrado por
 * `NotificationPreferencesPolicy` (HU-38) y con destinos resueltos por
 * `DeviceRegistryPort` (HU-18) — HU-21 solo decide cuándo y cómo se agrupan
 * y limitan, no de dónde salen.
 *
 * `convocatoriaId` es opaco para este contexto: el adaptador móvil lo
 * resuelve al detalle correcto (deep link), el dominio no sabe qué es una
 * convocatoria.
 */
export interface PendingNotification {
  readonly studentId: string;
  readonly convocatoriaId: string;
  /** Mayor valor = mas urgente (p. ej. mas cerca del vencimiento). Usado para priorizar al diferir. */
  readonly urgency: number;
  readonly generatedAt: Date;
}

/** Resultado de agrupar avisos coincidentes en el tiempo (criterio 1). */
export interface NotificationBatch {
  readonly studentId: string;
  readonly notifications: readonly PendingNotification[];
  readonly maxUrgency: number;
}
