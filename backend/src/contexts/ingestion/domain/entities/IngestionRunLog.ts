/**
 * Bitacora de una ejecucion de ingesta.
 *
 * RF-07 exige registrar leidos, procesados, duplicados y en cuarentena con
 * marca de tiempo consultable por el administrador. HU-01 produce los tres
 * primeros contadores y HU-04 alimenta la cuarentena sobre esta misma entidad.
 */
export interface IngestionIncident {
  readonly messageId: string | null;
  readonly cause: string;
  readonly occurredAt: Date;
}

export class IngestionRunLog {
  private _read = 0;
  private _processed = 0;
  private _duplicated = 0;
  private _quarantined = 0;
  private _finishedAt: Date | null = null;
  private readonly _incidents: IngestionIncident[] = [];
  // HU-04, criterio 4: senaliza que esta ejecucion necesita revision prioritaria.
  private _priorityReview = false;

  constructor(readonly startedAt: Date) {}

  recordRead(): void { this._read += 1; }
  recordProcessed(): void { this._processed += 1; }
  recordDuplicate(): void { this._duplicated += 1; }
  recordQuarantined(): void { this._quarantined += 1; }
  markPriorityReview(): void { this._priorityReview = true; }

  recordIncident(messageId: string | null, cause: string, occurredAt: Date): void {
    this._incidents.push({ messageId, cause, occurredAt });
  }

  finish(at: Date): void { this._finishedAt = at; }

  get read(): number { return this._read; }
  get processed(): number { return this._processed; }
  get duplicated(): number { return this._duplicated; }
  get quarantined(): number { return this._quarantined; }
  get finishedAt(): Date | null { return this._finishedAt; }
  get incidents(): readonly IngestionIncident[] { return [...this._incidents]; }
  get hasIncidents(): boolean { return this._incidents.length > 0; }
  get priorityReview(): boolean { return this._priorityReview; }
}
