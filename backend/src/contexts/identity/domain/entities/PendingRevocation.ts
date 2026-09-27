/**
 * Revocacion remota que no pudo completarse por falta de red (HU-39,
 * criterio 5). Conserva el refresh token porque es lo que autentica el
 * reintento ante el servidor: el almacenamiento que lo guarde debe ser el
 * seguro del dispositivo, y la entrada se elimina en cuanto el servidor
 * responde (con exito o con un rechazo definitivo).
 */
export interface PendingRevocation {
  readonly refreshToken: string;
  readonly deviceToken?: string;
  readonly origin: string;
  readonly requestedAt: Date;
}
