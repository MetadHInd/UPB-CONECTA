import type { ClassificationResultRecord } from '../../entities/ClassificationResult.js';

/**
 * Puerto minimo y explicito (HU-10, criterio 2, gap 2 documentado en el
 * README): notifica al administrador que un documento quedo en revision
 * pendiente. No existe todavia ningun mecanismo real de alertas en el
 * repositorio (correo, Slack, panel, etc.) — eso es alcance de otra
 * historia. Este puerto solo declara el contrato para que una integracion
 * futura lo implemente sin tocar el dominio.
 */
export interface AdminAlertPort {
  notifyPendingReview(record: ClassificationResultRecord): Promise<void>;
}
