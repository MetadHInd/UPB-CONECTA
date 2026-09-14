/**
 * HU-18 (RF-26, RF-64): un dispositivo capaz de recibir avisos push, ligado
 * a la cuenta de un estudiante. `deviceToken` es dato personal bajo custodia
 * minima (RNF-20): el dominio solo lo trata como identificador opaco.
 *
 * `invalidated` en vez de borrar el registro: conservar el hecho de que un
 * dispositivo dejo de estar vigente (por logout o por fallo de entrega, RF-64)
 * es lo que permite auditar por que un dispositivo dejo de recibir avisos.
 */
export type DeviceRegistrationStatus = 'active' | 'invalidated';
export type DeviceInvalidationReason = 'logout' | 'delivery-failed';

export interface DeviceRegistration {
  readonly studentId: string;
  readonly deviceToken: string;
  readonly status: DeviceRegistrationStatus;
  readonly registeredAt: Date;
  readonly updatedAt: Date;
  /** Por que se invalido (logout o fallo de entrega), para diagnostico. Ausente si sigue activo. */
  readonly invalidatedReason: DeviceInvalidationReason | null;
}
