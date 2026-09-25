import type { DueDate } from '../../value-objects/DueDate.js';
import type { ConvocatoriaId } from '../../value-objects/ConvocatoriaId.js';
import type { ConvocatoriaStatus } from '../../services/ConvocatoriaStatusPolicy.js';

export interface GetConvocatoriaDetailQuery {
  readonly convocatoriaId: ConvocatoriaId;
}

/** HU-15: vista de detalle completa de una convocatoria. */
export interface ConvocatoriaDetail {
  readonly sender: string;
  readonly subject: string;
  readonly body: string;
  readonly dueDate: DueDate;
  /** Criterio 4: estado de vencimiento explicito e inequivoco. */
  readonly status: ConvocatoriaStatus;
  /** Criterio 2: null es la ausencia explicita, no un campo vacio. */
  readonly applicationLink: string | null;
  /** Criterio 3: dominio de destino a mostrar antes de abrir el enlace externo. */
  readonly applicationDomain: string | null;
  /**
   * HU-50, criterio 5: si un administrador retiro esta convocatoria, el
   * detalle lo informa explicitamente en vez de mostrar contenido roto — no
   * se oculta el resto de la informacion, el cliente decide como
   * presentarlo (por ejemplo, un aviso sobre el contenido ya existente).
   */
  readonly withdrawn: boolean;
  readonly withdrawnAt: Date | null;
}

export interface GetConvocatoriaDetailPort {
  execute(query: GetConvocatoriaDetailQuery): Promise<ConvocatoriaDetail | null>;
}
