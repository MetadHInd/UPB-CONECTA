import type { DeviceInvalidationReason, DeviceRegistration } from '../../entities/DeviceRegistration.js';

export interface DeviceRegistryPort {
  /**
   * Registra un token nuevo o lo reactiva si ya existia (upsert por
   * `deviceToken`, nunca duplica). Criterio 1.
   */
  register(studentId: string, deviceToken: string, at: Date): Promise<void>;
  /**
   * El proveedor roto el identificador: el registro existente cambia de
   * token en el mismo lugar, no se crea una entrada nueva. Criterio 2.
   */
  rotateToken(previousToken: string, newToken: string, at: Date): Promise<void>;
  /** Cierre de sesion o fallo de entrega reportado por el proveedor. Criterios 3 y 5. */
  invalidate(deviceToken: string, reason: DeviceInvalidationReason, at: Date): Promise<void>;
  findByToken(deviceToken: string): Promise<DeviceRegistration | null>;
  /** Todos los dispositivos vigentes del estudiante, para el abanico de un aviso. Criterio 4. */
  findActiveForStudent(studentId: string): Promise<readonly DeviceRegistration[]>;
}
