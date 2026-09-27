/**
 * Contenido sincronizado en el dispositivo que el cierre de sesion elimina
 * (HU-39, criterio 3): el feed, el mapa descargado y el estado de las
 * postulaciones.
 */
export const LOCAL_CONTENT_KINDS = ['feed', 'offline-map', 'application-status'] as const;
export type LocalContentKind = (typeof LOCAL_CONTENT_KINDS)[number];

/**
 * Puerto de salida hacia el almacenamiento local del cliente (en Android, la
 * base Room y los archivos descargados). Es una operacion de dominio, no de
 * interfaz: la pantalla no decide que se borra. Debe funcionar sin red.
 */
export interface LocalDataPurgePort {
  purge(kinds: readonly LocalContentKind[]): Promise<void>;
}
