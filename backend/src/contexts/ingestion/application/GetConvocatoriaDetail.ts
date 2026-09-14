import type {
  ConvocatoriaDetail,
  GetConvocatoriaDetailPort,
  GetConvocatoriaDetailQuery
} from '../domain/ports/in/GetConvocatoriaDetailPort.js';
import type { ConsolidatedMessageRegistryPort } from '../domain/ports/out/ConsolidatedMessageRegistryPort.js';
import type { ClockPort } from '../domain/ports/out/ClockPort.js';
import { evaluateConvocatoriaStatus } from '../domain/services/ConvocatoriaStatusPolicy.js';

export interface GetConvocatoriaDetailDependencies {
  readonly registry: ConsolidatedMessageRegistryPort;
  readonly clock: ClockPort;
}

/**
 * HU-15: "El detalle consume la misma entidad de dominio que el feed"
 * (diseno de la historia en Jira) — no se inventa una entidad "Convocatoria"
 * nueva, se lee directamente el `ConsolidatedMessageRecord` que ya produce
 * el pipeline de ingesta (HU-01 a HU-08).
 *
 * Criterio 5 (acceso directo al mapa cuando declara un lugar del campus)
 * queda fuera: el propio ticket lo marca como dependiente de HU-24
 * (catalogo de espacios), que no existe todavia.
 */
export class GetConvocatoriaDetail implements GetConvocatoriaDetailPort {
  constructor(private readonly deps: GetConvocatoriaDetailDependencies) {}

  async execute(query: GetConvocatoriaDetailQuery): Promise<ConvocatoriaDetail | null> {
    const record = await this.deps.registry.findById(query.convocatoriaId);
    if (record === null) return null;

    return {
      sender: record.sender,
      subject: record.subject,
      body: record.body,
      dueDate: record.dueDate,
      status: evaluateConvocatoriaStatus(record.dueDate, this.deps.clock.now()),
      applicationLink: record.applicationLink,
      applicationDomain: record.applicationLink ? extractDomain(record.applicationLink) : null
    };
  }
}

/**
 * Criterio 3: "un enlace externo nunca se abre sin exponer el destino al
 * usuario" — se extrae el dominio aqui para que el cliente lo muestre antes
 * de abrir el navegador; abrir el navegador en si es responsabilidad del
 * adaptador movil.
 */
function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
