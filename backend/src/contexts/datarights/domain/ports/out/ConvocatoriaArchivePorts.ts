export interface ArchivableConvocatoria {
  readonly convocatoriaId: string;
  /** Fecha de cierre; las que no tienen instante concreto no vencen y nunca se archivan por plazo. */
  readonly dueAt: Date | null;
}

/** Convocatorias conocidas con fecha de cierre. Solo lectura. */
export interface ConvocatoriaSourcePort {
  findWithDueDate(): Promise<readonly ArchivableConvocatoria[]>;
}

export interface ConvocatoriaArchiveRecord {
  readonly convocatoriaId: string;
  readonly dueAt: Date;
  readonly archivedAt: Date;
}

/** Registro de convocatorias archivadas (criterio 6). */
export interface ConvocatoriaArchivePort {
  /** Idempotente por `convocatoriaId`. `true` si la archivo ahora, `false` si ya estaba archivada. */
  archive(record: ConvocatoriaArchiveRecord): Promise<boolean>;
  findAll(): Promise<readonly ConvocatoriaArchiveRecord[]>;
}
