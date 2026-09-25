import type { DueDate } from '../../value-objects/DueDate.js';
import type { ConvocatoriaId } from '../../value-objects/ConvocatoriaId.js';

/**
 * Registro de mensajes consolidados por deduplicacion semantica (HU-03).
 *
 * Distinto de `ProcessedMessageRegistryPort`: aquel evita reprocesar el mismo
 * `Message-ID` (idempotencia tecnica); este agrupa reenvios con `Message-ID`
 * distinto pero mismo remitente+asunto dentro de una ventana temporal
 * (deduplicacion semantica, RF-05).
 */
export interface ConsolidatedMessageRecord {
  readonly sender: string;
  readonly subject: string;
  readonly body: string;
  /** Message-ID representative del grupo (el envio mas reciente que actualizo el grupo). */
  readonly representativeMessageId?: string | null;
  /** Fecha del primer envio del grupo consolidado (se conserva siempre). */
  readonly firstSentAt: Date;
  /** Fecha del envio mas reciente: ancla movil de la ventana temporal. */
  readonly lastSentAt: Date;
  /** Cantidad de reenvios detectados (no cuenta el envio original). */
  readonly resendCount: number;
  /** HU-08: fecha de cierre interpretada del cuerpo vigente del grupo. */
  readonly dueDate: DueDate;
  /** HU-08, criterio 5: enlace de postulacion declarado en el mensaje. */
  readonly applicationLink: string | null;
  /**
   * HU-50: momento en que un administrador retiro esta convocatoria del feed,
   * o `null` si sigue vigente. Vive aqui, no en `classification`, porque es
   * una decision de negocio sobre la convocatoria (visible o no), distinta
   * del `publicationStatus` del clasificador (confiable o no) — ver
   * README de `ingestion`, seccion HU-50.
   */
  readonly withdrawnAt: Date | null;
}

export interface ConsolidatedMessageRegistryPort {
  /**
   * Busca un grupo consolidado con el mismo remitente y asunto cuyo ultimo
   * envio registrado caiga dentro de `windowMs` respecto a `referenceDate`.
   * Devuelve null si no hay ninguno (el mensaje inicia un grupo nuevo).
   */
  findWithinWindow(
    sender: string,
    subject: string,
    referenceDate: Date,
    windowMs: number
  ): Promise<ConsolidatedMessageRecord | null>;

  /** HU-15: busqueda directa por identidad estable, para la vista de detalle. */
  findById(id: ConvocatoriaId): Promise<ConsolidatedMessageRecord | null>;

  /**
   * HU-49: resuelve el grupo consolidado a partir del `messageId` de su
   * representante — la clasificacion (HU-06+) y el targeting (HU-07) solo
   * conocen ese id, no el `ConvocatoriaId` compuesto. Complementaria a
   * `findById`, no lo reemplaza: cada una resuelve la identidad que su
   * llamador ya tiene a mano.
   */
  findByRepresentativeMessageId(messageId: string): Promise<ConsolidatedMessageRecord | null>;

  save(record: ConsolidatedMessageRecord): Promise<void>;
}
