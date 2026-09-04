/**
 * Identidad de un mensaje institucional.
 *
 * RF-02, criterio de aceptacion 4: la identidad se determina por el encabezado
 * unico Message-ID y no por asunto ni por fecha. Dos reenvios del mismo anuncio
 * comparten asunto pero no Message-ID, de modo que apoyarse en el asunto
 * confundiria la idempotencia con la deduplicacion semantica, que es HU-03.
 */
export class InvalidMessageIdError extends Error {
  constructor(motivo: string) {
    super(`Message-ID invalido: ${motivo}`);
    this.name = 'InvalidMessageIdError';
  }
}

export class MessageId {
  private constructor(private readonly value: string) {}

  static fromHeader(rawHeader: string | null | undefined): MessageId {
    if (rawHeader === null || rawHeader === undefined) {
      throw new InvalidMessageIdError('el mensaje no declara el encabezado');
    }
    const normalized = rawHeader.trim().replace(/^<+/, '').replace(/>+$/, '').trim().toLowerCase();
    if (normalized.length === 0) {
      throw new InvalidMessageIdError('el encabezado esta vacio');
    }
    if (!normalized.includes('@')) {
      throw new InvalidMessageIdError(`el encabezado no tiene forma de identificador global: ${normalized}`);
    }
    return new MessageId(normalized);
  }

  equals(other: MessageId): boolean {
    return other instanceof MessageId && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
