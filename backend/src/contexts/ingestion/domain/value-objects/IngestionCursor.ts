/**
 * Punto de lectura confirmado sobre el buzon.
 *
 * RF-02, criterio de aceptacion 5: ante un fallo a mitad de lote el cursor
 * conservado evita reprocesar lo ya confirmado y evita saltarse lo pendiente.
 * El cursor solo avanza sobre confirmaciones y nunca retrocede.
 */
export class IngestionCursor {
  private constructor(
    readonly lastConfirmedUid: number,
    readonly lastConfirmedAt: Date | null
  ) {}

  static initial(): IngestionCursor {
    return new IngestionCursor(0, null);
  }

  static restore(lastConfirmedUid: number, lastConfirmedAt: Date | null): IngestionCursor {
    if (!Number.isInteger(lastConfirmedUid) || lastConfirmedUid < 0) {
      throw new RangeError(`Punto de lectura invalido: ${lastConfirmedUid}`);
    }
    return new IngestionCursor(lastConfirmedUid, lastConfirmedAt);
  }

  advanceTo(uid: number, at: Date): IngestionCursor {
    if (uid <= this.lastConfirmedUid) return this;
    return new IngestionCursor(uid, at);
  }

  equals(other: IngestionCursor): boolean {
    return other instanceof IngestionCursor && other.lastConfirmedUid === this.lastConfirmedUid;
  }
}
