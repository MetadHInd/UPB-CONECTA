/**
 * Sancion sobre la participacion en el foro. Quien la impone y como se apela
 * es otra historia; aqui solo se consulta (HU-30 criterio 6). Intervalo
 * semiabierto: vigente desde `startsAt` inclusive hasta `endsAt` exclusive.
 */
export interface Sanction {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export function isSanctionActive(sanction: Sanction, now: Date): boolean {
  return sanction.startsAt.getTime() <= now.getTime() && now.getTime() < sanction.endsAt.getTime();
}
