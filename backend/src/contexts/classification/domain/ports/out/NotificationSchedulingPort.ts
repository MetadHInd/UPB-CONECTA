import type { ClassificationResultRecord } from '../../entities/ClassificationResult.js';

/**
 * Puerto minimo y explicito (HU-10, criterio 3, gap 2 documentado en el
 * README): programa las notificaciones de un documento que se publico. El
 * contexto `notifications` de este repositorio hoy solo gestiona
 * preferencias y dispositivos — no existe ningun caso de uso de "enviar" ni
 * "programar" contenido nuevo, y construirlo esta fuera de alcance de esta
 * historia. Este puerto solo declara el contrato; no implementa plantillas,
 * contenido ni entrega push.
 */
export interface NotificationSchedulingPort {
  scheduleForPublication(record: ClassificationResultRecord): Promise<void>;
}
