import type { IngestionRunLog } from '../entities/IngestionRunLog.js';

/**
 * HU-04, criterio 4: cuando la proporcion de mensajes en cuarentena de una
 * ejecucion supera un umbral configurable, el incidente se marca para
 * revision prioritaria en vez de perderse entre el resto de la bitacora.
 *
 * La proporcion se calcula sobre el total de mensajes intentados
 * (`read + quarantined`), no solo sobre `read`: un mensaje en cuarentena
 * nunca se contabiliza como leido (se reporta aparte, antes de que el lote
 * traducido entre al bucle principal), asi que dividir solo por `read`
 * dejaria sin detectar el caso mas grave — un lote enteramente en cuarentena,
 * donde `read` es 0.
 */
export class QuarantineIncidentPolicy {
  constructor(private readonly thresholdRatio: number) {
    if (!Number.isFinite(thresholdRatio) || thresholdRatio < 0) {
      throw new RangeError(`El umbral de cuarentena debe ser un numero >= 0, se recibio ${thresholdRatio}`);
    }
  }

  exceedsThreshold(log: IngestionRunLog): boolean {
    const attempted = log.read + log.quarantined;
    if (attempted === 0) return false;
    return log.quarantined / attempted > this.thresholdRatio;
  }
}
