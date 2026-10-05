import type { PublicationStatus } from '../entities/ClassificationResult.js';

export type PublicationNotification = 'alert-admin' | 'schedule-notifications' | 'none';

/**
 * Politica de reenvios (politica de dominio pura): la ingesta clasifica cada
 * mensaje que llega, incluidos los reenvios que HU-03 consolida en un mismo
 * grupo, pero solo se alerta o se notifica cuando el estado de publicacion
 * del grupo cambia respecto al del mensaje representativo anterior.
 * `previous === null` significa que el grupo no tenia ningun resultado de
 * clasificacion previo (grupo nuevo, o clasificacion anterior fallida o
 * descartada): nada se aviso todavia, asi que se trata como primera vez.
 */
export function decidePublicationNotification(
  previous: PublicationStatus | null,
  current: PublicationStatus
): PublicationNotification {
  if (previous === current) {
    return 'none';
  }
  return current === 'pending-review' ? 'alert-admin' : 'schedule-notifications';
}
